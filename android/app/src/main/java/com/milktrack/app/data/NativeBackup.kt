package com.milktrack.app.data

import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.security.SecureRandom
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.crypto.Cipher
import javax.crypto.CipherInputStream
import javax.crypto.CipherOutputStream
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

internal data class RestoredNativeReceipt(
    val receipt: NativeReceipt,
    val imageBytes: ByteArray,
)

internal data class RestoredNativeBackup(
    val receipts: List<RestoredNativeReceipt>,
)

internal object NativeBackup {
    private val MAGIC = "MILKDB3!".toByteArray(Charsets.US_ASCII)
    private const val SALT_BYTES = 16
    private const val IV_BYTES = 12
    private const val ITERATIONS = 210_000
    private const val MAX_IMAGE_BYTES = 10 * 1024 * 1024
    private const val MAX_BACKUP_BYTES = 250 * 1024 * 1024
    private const val MAX_RECEIPTS = 20_000

    fun write(
        output: OutputStream,
        receipts: List<StoredNativeReceipt>,
        images: Map<String, ByteArray>,
        passphrase: CharArray,
    ) {
        require(passphrase.size >= 8) { "Use a backup password with at least 8 characters." }
        require(receipts.size <= MAX_RECEIPTS) { "This backup contains too many receipts." }
        val totalBytes = images.values.sumOf(ByteArray::size)
        require(totalBytes <= MAX_BACKUP_BYTES) { "The backup is larger than 250 MB." }
        require(receipts.all { row ->
            val image = images[row.receipt.id]
            image != null && image.isNotEmpty() && image.size <= MAX_IMAGE_BYTES
        }) { "Every saved receipt must include its original photo in the backup." }

        val random = SecureRandom()
        val salt = ByteArray(SALT_BYTES).also(random::nextBytes)
        val iv = ByteArray(IV_BYTES).also(random::nextBytes)
        val cipher = cipher(Cipher.ENCRYPT_MODE, passphrase, salt, iv)
        val header = DataOutputStream(output)
        header.write(MAGIC)
        header.write(salt)
        header.write(iv)
        header.flush()

        val zip = ZipOutputStream(CipherOutputStream(output, cipher))
        try {
            val manifest = JSONObject()
                .put("format", 3)
                .put("app", "MilkTrack")
                .put("receipts", JSONArray().apply {
                    receipts.forEach { row ->
                        put(row.receipt.toJson())
                    }
                })
            zip.putNextEntry(ZipEntry("manifest.json"))
            zip.write(manifest.toString().toByteArray(Charsets.UTF_8))
            zip.closeEntry()
            images.forEach { (id, bytes) ->
                require(UUID_PATTERN.matches(id)) { "The backup contains an invalid receipt ID." }
                zip.putNextEntry(ZipEntry("photos/$id"))
                zip.write(bytes)
                zip.closeEntry()
            }
        } finally {
            zip.close()
            passphrase.fill('\u0000')
        }
    }

    fun read(input: InputStream, passphrase: CharArray): RestoredNativeBackup {
        require(passphrase.size >= 8) { "Enter the password used to create this backup." }
        try {
            val header = DataInputStream(input)
            val magic = ByteArray(MAGIC.size)
            header.readFully(magic)
            require(magic.contentEquals(MAGIC)) {
                "This is not a MilkTrack encrypted backup."
            }
            val salt = ByteArray(SALT_BYTES)
            val iv = ByteArray(IV_BYTES)
            header.readFully(salt)
            header.readFully(iv)

            val zip = ZipInputStream(
                CipherInputStream(input, cipher(Cipher.DECRYPT_MODE, passphrase, salt, iv)),
            )
            var manifest: JSONObject? = null
            val photos = HashMap<String, ByteArray>()
            var archiveBytes = 0L
            zip.use { archive ->
                while (true) {
                    val entry = archive.nextEntry ?: break
                    require(!entry.isDirectory && !entry.name.contains("..") && !entry.name.contains('\\')) {
                        "The backup contains an unsafe archive entry."
                    }
                    when {
                        entry.name == "manifest.json" -> {
                            require(manifest == null) { "The backup contains duplicate manifests." }
                            val bytes = archive.readBounded(MAX_MANIFEST_BYTES)
                            archiveBytes += bytes.size
                            manifest = JSONObject(String(bytes, Charsets.UTF_8))
                        }
                        entry.name.startsWith("photos/") -> {
                            val id = entry.name.removePrefix("photos/")
                            require(UUID_PATTERN.matches(id)) { "The backup contains an invalid photo name." }
                            require(!photos.containsKey(id)) { "The backup contains duplicate receipt photos." }
                            val bytes = archive.readBounded(MAX_IMAGE_BYTES)
                            archiveBytes += bytes.size
                            require(archiveBytes <= MAX_BACKUP_BYTES) { "The backup is larger than 250 MB." }
                            photos[id] = bytes
                        }
                        else -> throw IllegalArgumentException("The backup contains an unsupported file.")
                    }
                    archive.closeEntry()
                }
            }

            val root = requireNotNull(manifest) { "The backup does not contain a receipt manifest." }
            require(root.optInt("format") == 3 && root.optString("app") == "MilkTrack") {
                "This MilkTrack backup format is not supported."
            }
            val receiptArray = root.optJSONArray("receipts")
                ?: throw IllegalArgumentException("The backup receipt list is invalid.")
            require(receiptArray.length() <= MAX_RECEIPTS) { "This backup contains too many receipts." }
            val restored = ArrayList<RestoredNativeReceipt>(receiptArray.length())
            for (index in 0 until receiptArray.length()) {
                val receipt = receiptArray.getJSONObject(index).toNativeReceipt()
                val photo = photos[receipt.id]
                    ?: throw IllegalArgumentException("A verified receipt is missing its original photo.")
                require(receipt.originalMimeType in SUPPORTED_IMAGE_TYPES) {
                    "A backup receipt uses an unsupported image format."
                }
                restored += RestoredNativeReceipt(receipt, photo)
            }
            require(photos.keys.all { id -> restored.any { it.receipt.id == id } }) {
                "The backup contains a photo without a receipt."
            }
            return RestoredNativeBackup(restored)
        } catch (error: Exception) {
            if (error is IllegalArgumentException && error.message?.contains("password", true) == true) {
                throw error
            }
            throw IllegalArgumentException(
                "The backup could not be opened. Check the password and choose a valid MilkTrack backup.",
                error,
            )
        } finally {
            passphrase.fill('\u0000')
        }
    }

    private fun NativeReceipt.toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("receiptDate", receiptDate)
        .put("receiptTime", receiptTime)
        .put("shift", shift)
        .put("milkType", "Cow")
        .put("quantityLitres", quantityLitres)
        .put("fat", fat)
        .put("snf", snf)
        .put("clr", clr)
        .put("ratePerLitre", ratePerLitre)
        .put("totalAmount", totalAmount)
        .put("originalFilename", originalFilename)
        .put("originalMimeType", originalMimeType)
        .put("entryMethod", entryMethod)
        .put("ocrRawText", ocrRawText)
        .put("supplierCode", supplierCode)
        .put("mccCode", mccCode)
        .put("vlccCode", vlccCode)
        .put("verificationTimestamp", verificationTimestamp)
        .put("verificationStatus", "verified")

    private fun JSONObject.toNativeReceipt(): NativeReceipt {
        require(optString("verificationStatus") == "verified") {
            "The backup contains a receipt that was not verified."
        }
        val receipt = NativeReceipt(
            id = getString("id"),
            receiptDate = getString("receiptDate"),
            receiptTime = getString("receiptTime"),
            shift = getString("shift"),
            quantityLitres = getString("quantityLitres"),
            fat = getString("fat"),
            snf = getString("snf"),
            clr = getString("clr"),
            ratePerLitre = getString("ratePerLitre"),
            totalAmount = getString("totalAmount"),
            originalFilename = getString("originalFilename"),
            originalMimeType = getString("originalMimeType"),
            entryMethod = getString("entryMethod"),
            ocrRawText = optString("ocrRawText"),
            supplierCode = optString("supplierCode").takeIf(String::isNotBlank),
            mccCode = optString("mccCode").takeIf(String::isNotBlank),
            vlccCode = optString("vlccCode").takeIf(String::isNotBlank),
            verificationTimestamp = optString("verificationTimestamp").takeIf(String::isNotBlank),
        )
        require(UUID_PATTERN.matches(receipt.id)) { "The backup contains an invalid receipt ID." }
        require(receipt.entryMethod in setOf("camera", "upload")) {
            "The backup receipt entry method is invalid."
        }
        require(java.time.LocalDate.parse(receipt.receiptDate).toString() == receipt.receiptDate) {
            "The backup contains an invalid receipt date."
        }
        require(receipt.quantityLitres.isDecimal() && receipt.fat.isDecimal() &&
            receipt.snf.isDecimal() && receipt.clr.isDecimal() &&
            receipt.ratePerLitre.isDecimal() && receipt.totalAmount.isDecimal()) {
            "The backup contains invalid receipt values."
        }
        return receipt
    }

    private fun String.isDecimal(): Boolean = matches(Regex("""\d{1,8}(?:\.\d{1,4})?"""))

    private fun InputStream.readBounded(limit: Int): ByteArray {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
            val count = read(buffer)
            if (count < 0) break
            require(output.size() + count <= limit) { "The backup contains an oversized file." }
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }

    private fun cipher(mode: Int, passphrase: CharArray, salt: ByteArray, iv: ByteArray): Cipher {
        val spec = PBEKeySpec(passphrase, salt, ITERATIONS, 256)
        val key = try {
            SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
        return Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(mode, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
            key.fill(0)
        }
    }

    private const val MAX_MANIFEST_BYTES = 32 * 1024 * 1024
    private val UUID_PATTERN =
        Regex("""^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$""", RegexOption.IGNORE_CASE)
    private val SUPPORTED_IMAGE_TYPES = setOf(
        "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
    )
}
