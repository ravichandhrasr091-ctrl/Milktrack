package com.milktrack.app.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.io.File
import java.security.MessageDigest
import java.util.UUID

internal data class StoredNativeReceipt(
    val receipt: NativeReceipt,
    val syncStatus: String,
    val imagePath: String?,
)

internal class NativeReceiptStore(context: Context) :
    SQLiteOpenHelper(context.applicationContext, DATABASE_NAME, null, DATABASE_VERSION) {

    override fun onCreate(database: SQLiteDatabase) {
        database.execSQL(
            """
            CREATE TABLE receipts (
                owner_id TEXT NOT NULL,
                id TEXT NOT NULL,
                receipt_date TEXT NOT NULL,
                receipt_time TEXT NOT NULL,
                shift TEXT NOT NULL,
                quantity_litres TEXT NOT NULL,
                fat TEXT NOT NULL,
                snf TEXT NOT NULL,
                clr TEXT NOT NULL,
                rate_per_litre TEXT NOT NULL,
                total_amount TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                original_mime_type TEXT NOT NULL,
                entry_method TEXT NOT NULL,
                ocr_raw_text TEXT NOT NULL,
                supplier_code TEXT,
                mcc_code TEXT,
                vlcc_code TEXT,
                verification_timestamp TEXT NOT NULL,
                sync_status TEXT NOT NULL,
                image_path TEXT,
                PRIMARY KEY (owner_id, id)
            )
            """.trimIndent(),
        )
        database.execSQL(
            "CREATE INDEX receipts_owner_date ON receipts(owner_id, receipt_date DESC, receipt_time DESC)",
        )
        database.execSQL(
            "CREATE INDEX receipts_owner_sync ON receipts(owner_id, sync_status)",
        )
    }

    override fun onUpgrade(database: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 1) onCreate(database)
    }

    @Synchronized
    fun all(ownerId: String): List<StoredNativeReceipt> {
        requireOwner(ownerId)
        return readableDatabase.query(
            TABLE,
            null,
            "owner_id = ?",
            arrayOf(ownerId),
            null,
            null,
            "receipt_date DESC, receipt_time DESC",
        ).use { cursor ->
            buildList {
                while (cursor.moveToNext()) add(cursor.toStoredReceipt())
            }
        }
    }

    @Synchronized
    fun pending(ownerId: String): List<StoredNativeReceipt> {
        requireOwner(ownerId)
        return readableDatabase.query(
            TABLE,
            null,
            "owner_id = ? AND sync_status = ?",
            arrayOf(ownerId, SYNC_PENDING),
            null,
            null,
            "receipt_date ASC, receipt_time ASC",
        ).use { cursor ->
            buildList {
                while (cursor.moveToNext()) add(cursor.toStoredReceipt())
            }
        }
    }

    @Synchronized
    fun find(ownerId: String, receiptId: String): StoredNativeReceipt? {
        requireOwner(ownerId)
        return readableDatabase.query(
            TABLE,
            null,
            "owner_id = ? AND id = ?",
            arrayOf(ownerId, receiptId),
            null,
            null,
            null,
        ).use { cursor -> if (cursor.moveToFirst()) cursor.toStoredReceipt() else null }
    }

    @Synchronized
    fun saveVerified(
        ownerId: String,
        receipt: NativeReceipt,
        imagePath: String,
        syncStatus: String,
    ) {
        requireOwner(ownerId)
        require(receipt.id.isNotBlank())
        require(receipt.originalMimeType in SUPPORTED_IMAGE_TYPES)
        require(File(imagePath).isFile) { "The original receipt photo is unavailable." }
        require(syncStatus in setOf(SYNC_PENDING, SYNCED, SYNC_LOCAL_ONLY))
        val values = receiptValues(ownerId, receipt, imagePath, syncStatus)
        writableDatabase.insertOrThrow(TABLE, null, values)
    }

    @Synchronized
    fun mergeRemote(ownerId: String, receipts: List<NativeReceipt>) {
        requireOwner(ownerId)
        val database = writableDatabase
        database.beginTransaction()
        try {
            for (receipt in receipts) {
                val existing = find(ownerId, receipt.id)
                val imagePath = existing?.imagePath
                val values = receiptValues(ownerId, receipt, imagePath, SYNCED)
                database.insertWithOnConflict(TABLE, null, values, SQLiteDatabase.CONFLICT_REPLACE)
            }
            database.setTransactionSuccessful()
        } finally {
            database.endTransaction()
        }
    }

    @Synchronized
    fun markSynced(ownerId: String, receiptId: String) {
        requireOwner(ownerId)
        writableDatabase.update(
            TABLE,
            ContentValues().apply { put("sync_status", SYNCED) },
            "owner_id = ? AND id = ?",
            arrayOf(ownerId, receiptId),
        )
    }

    @Synchronized
    fun updateImagePath(ownerId: String, receiptId: String, imagePath: String) {
        requireOwner(ownerId)
        writableDatabase.update(
            TABLE,
            ContentValues().apply { put("image_path", imagePath) },
            "owner_id = ? AND id = ?",
            arrayOf(ownerId, receiptId),
        )
    }

    @Synchronized
    fun restoreIfMissing(
        ownerId: String,
        receipt: NativeReceipt,
        imagePath: String?,
    ): Boolean {
        requireOwner(ownerId)
        val values = receiptValues(
            ownerId,
            receipt,
            imagePath,
            if (imagePath == null) SYNC_LOCAL_ONLY else SYNC_PENDING,
        )
        return writableDatabase.insertWithOnConflict(
            TABLE,
            null,
            values,
            SQLiteDatabase.CONFLICT_IGNORE,
        ) != -1L
    }

    @Synchronized
    fun backupRows(ownerId: String): List<StoredNativeReceipt> = all(ownerId)

    private fun receiptValues(
        ownerId: String,
        receipt: NativeReceipt,
        imagePath: String?,
        syncStatus: String,
    ): ContentValues = ContentValues().apply {
        put("owner_id", ownerId)
        put("id", receipt.id)
        put("receipt_date", receipt.receiptDate)
        put("receipt_time", receipt.receiptTime)
        put("shift", receipt.shift)
        put("quantity_litres", receipt.quantityLitres)
        put("fat", receipt.fat)
        put("snf", receipt.snf)
        put("clr", receipt.clr)
        put("rate_per_litre", receipt.ratePerLitre)
        put("total_amount", receipt.totalAmount)
        put("original_filename", receipt.originalFilename)
        put("original_mime_type", receipt.originalMimeType)
        put("entry_method", receipt.entryMethod)
        put("ocr_raw_text", receipt.ocrRawText.take(20_000))
        put("supplier_code", receipt.supplierCode)
        put("mcc_code", receipt.mccCode)
        put("vlcc_code", receipt.vlccCode)
        put("verification_timestamp", receipt.verificationTimestamp ?: java.time.Instant.now().toString())
        put("sync_status", syncStatus)
        put("image_path", imagePath)
    }

    private fun android.database.Cursor.toStoredReceipt(): StoredNativeReceipt {
        fun text(column: String): String = getString(getColumnIndexOrThrow(column))
        fun optionalText(column: String): String? =
            getString(getColumnIndexOrThrow(column))?.takeIf(String::isNotBlank)

        val receipt = NativeReceipt(
            id = text("id"),
            receiptDate = text("receipt_date"),
            receiptTime = text("receipt_time"),
            shift = text("shift"),
            quantityLitres = text("quantity_litres"),
            fat = text("fat"),
            snf = text("snf"),
            clr = text("clr"),
            ratePerLitre = text("rate_per_litre"),
            totalAmount = text("total_amount"),
            originalFilename = text("original_filename"),
            originalMimeType = text("original_mime_type"),
            entryMethod = text("entry_method"),
            ocrRawText = text("ocr_raw_text"),
            supplierCode = optionalText("supplier_code"),
            mccCode = optionalText("mcc_code"),
            vlccCode = optionalText("vlcc_code"),
            verificationTimestamp = text("verification_timestamp"),
        )
        return StoredNativeReceipt(
            receipt = receipt,
            syncStatus = text("sync_status"),
            imagePath = optionalText("image_path"),
        )
    }

    private fun requireOwner(ownerId: String) {
        require(ownerId.isNotBlank()) { "A signed-in account is required to access receipts." }
    }

    companion object {
        const val SYNC_PENDING = "pending"
        const val SYNCED = "synced"
        const val SYNC_LOCAL_ONLY = "local-only"
        private const val DATABASE_NAME = "milktrack-native.db"
        private const val DATABASE_VERSION = 1
        private const val TABLE = "receipts"
        private val SUPPORTED_IMAGE_TYPES = setOf(
            "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
        )

        fun privateImagePath(context: Context, ownerId: String, receiptId: String, mimeType: String): File {
            val ownerHash = MessageDigest.getInstance("SHA-256")
                .digest(ownerId.toByteArray())
                .take(12)
                .joinToString("") { "%02x".format(it) }
            val extension = when (mimeType) {
                "image/png" -> "png"
                "image/webp" -> "webp"
                "image/heic" -> "heic"
                "image/heif" -> "heif"
                else -> "jpg"
            }
            return File(context.filesDir, "receipts/$ownerHash/$receiptId.$extension")
        }

        fun newReceiptId(): String = UUID.randomUUID().toString()
    }
}
