package com.milktrack.app.data

import android.content.Context
import java.io.File

internal data class ReceiptSyncResult(
    val receipts: List<StoredNativeReceipt>,
    val message: String? = null,
)

internal class NativeReceiptRepository(context: Context) {
    private val appContext = context.applicationContext
    private val store = NativeReceiptStore(appContext)

    fun localReceipts(ownerId: String): List<StoredNativeReceipt> = store.all(ownerId)

    suspend fun refresh(ownerId: String, idToken: String): ReceiptSyncResult {
        return try {
            store.mergeRemote(ownerId, NativeReceiptApi.listReceipts(idToken))
            val pending = store.pending(ownerId)
            var syncWarning: String? = null
            for (stored in pending) {
                val imagePath = stored.imagePath
                if (imagePath == null) {
                    syncWarning = "A receipt is missing its original photo and could not sync."
                    continue
                }
                try {
                    NativeReceiptApi.saveReceipt(
                        idToken = idToken,
                        receipt = stored.receipt,
                        imageBytes = File(imagePath).readBytes(),
                        ocrRawText = stored.receipt.ocrRawText,
                        entryMethod = stored.receipt.entryMethod,
                    )
                    store.markSynced(ownerId, stored.receipt.id)
                } catch (error: Exception) {
                    if (syncWarning == null) {
                        syncWarning = "Some verified receipts are still waiting to sync: ${
                            error.message ?: "connection unavailable"
                        }"
                    }
                }
            }
            ReceiptSyncResult(store.all(ownerId), syncWarning)
        } catch (error: Exception) {
            ReceiptSyncResult(
                receipts = store.all(ownerId),
                message = error.message ?: "MilkTrack could not refresh cloud receipts.",
            )
        }
    }

    suspend fun saveVerified(
        ownerId: String,
        idToken: String,
        receipt: NativeReceipt,
        imageBytes: ByteArray,
    ): ReceiptSyncResult {
        require(imageBytes.isNotEmpty() && imageBytes.size <= MAX_IMAGE_BYTES) {
            "The original receipt photo must be between 1 byte and 10 MB."
        }
        val imageFile = NativeReceiptStore.privateImagePath(
            appContext,
            ownerId,
            receipt.id,
            receipt.originalMimeType,
        )
        imageFile.parentFile?.mkdirs()
        val temporary = File(imageFile.parentFile, "${imageFile.name}.tmp")
        try {
            temporary.outputStream().use { it.write(imageBytes) }
            if (!temporary.renameTo(imageFile)) {
                throw IllegalStateException("MilkTrack could not securely save the original receipt photo.")
            }
        } finally {
            temporary.delete()
        }

        store.saveVerified(
            ownerId = ownerId,
            receipt = receipt,
            imagePath = imageFile.absolutePath,
            syncStatus = NativeReceiptStore.SYNC_PENDING,
        )
        return try {
            NativeReceiptApi.saveReceipt(
                idToken = idToken,
                receipt = receipt,
                imageBytes = imageBytes,
                ocrRawText = receipt.ocrRawText,
                entryMethod = receipt.entryMethod,
            )
            store.markSynced(ownerId, receipt.id)
            ReceiptSyncResult(store.all(ownerId), "Receipt verified and synced to your MilkTrack account.")
        } catch (error: Exception) {
            ReceiptSyncResult(
                receipts = store.all(ownerId),
                message = "Verified receipt saved securely on this device. Cloud sync will retry: ${
                    error.message ?: "connection unavailable"
                }",
            )
        }
    }

    suspend fun imageFor(
        ownerId: String,
        idToken: String,
        receiptId: String,
    ): File {
        val stored = store.find(ownerId, receiptId)
            ?: throw IllegalStateException("This receipt is not available in the signed-in account.")
        stored.imagePath?.let { path ->
            val cached = File(path)
            if (cached.isFile) return cached
        }
        val bytes = NativeReceiptApi.downloadReceiptImage(idToken, receiptId)
        val target = NativeReceiptStore.privateImagePath(
            appContext,
            ownerId,
            receiptId,
            stored.receipt.originalMimeType,
        )
        target.parentFile?.mkdirs()
        val temporary = File(target.parentFile, "${target.name}.tmp")
        try {
            temporary.outputStream().use { it.write(bytes) }
            if (!temporary.renameTo(target)) {
                throw IllegalStateException("MilkTrack could not cache the original receipt photo.")
            }
        } finally {
            temporary.delete()
        }
        store.updateImagePath(ownerId, receiptId, target.absolutePath)
        return target
    }

    fun backupRows(ownerId: String): List<StoredNativeReceipt> = store.backupRows(ownerId)

    fun restoreReceipt(
        ownerId: String,
        receipt: NativeReceipt,
        imageBytes: ByteArray?,
    ): Boolean {
        val imagePath = imageBytes?.let { bytes ->
            require(bytes.isNotEmpty() && bytes.size <= MAX_IMAGE_BYTES)
            val file = NativeReceiptStore.privateImagePath(
                appContext,
                ownerId,
                receipt.id,
                receipt.originalMimeType,
            )
            file.parentFile?.mkdirs()
            val temporary = File(file.parentFile, "${file.name}.tmp")
            try {
                temporary.outputStream().use { it.write(bytes) }
                if (!temporary.renameTo(file)) {
                    throw IllegalStateException("MilkTrack could not restore a receipt photo.")
                }
            } finally {
                temporary.delete()
            }
            file.absolutePath
        }
        return store.restoreIfMissing(ownerId, receipt, imagePath)
    }

    companion object {
        const val MAX_IMAGE_BYTES = 10 * 1024 * 1024
    }
}
