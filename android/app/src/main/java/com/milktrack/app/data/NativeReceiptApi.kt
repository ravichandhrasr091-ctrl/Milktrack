package com.milktrack.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.math.BigDecimal
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.time.LocalDate
import java.time.YearMonth

internal data class NativeReceipt(
    val id: String,
    val receiptDate: String,
    val receiptTime: String,
    val shift: String,
    val quantityLitres: String,
    val fat: String,
    val snf: String,
    val clr: String,
    val ratePerLitre: String,
    val totalAmount: String,
    val originalFilename: String,
    val originalMimeType: String,
)

internal data class AssistantMessage(
    val role: String,
    val content: String,
)

internal object NativeReceiptApi {
    private const val BASE_URL =
        "https://97fqs6d0sh.execute-api.ap-southeast-2.amazonaws.com/"
    private const val MAX_IMAGE_BYTES = 10 * 1024 * 1024
    private const val REQUEST_TIMEOUT_MS = 30_000

    suspend fun listReceipts(idToken: String): List<NativeReceipt> =
        withContext(Dispatchers.IO) {
            val receipts = mutableListOf<NativeReceipt>()
            val seenTokens = mutableSetOf<String>()
            var nextToken: String? = null
            do {
                val path = buildString {
                    append("receipts")
                    nextToken?.let {
                        append("?nextToken=")
                        append(java.net.URLEncoder.encode(it, "UTF-8"))
                    }
                }
                val result = apiRequest("GET", path, idToken)
                val items = result.optJSONArray("receipts")
                    ?: throw IllegalStateException("The cloud API returned an invalid receipt list.")
                for (index in 0 until items.length()) {
                    receipts += parseReceipt(items.getJSONObject(index))
                }
                nextToken = result.optString("nextToken").takeIf { it.isNotBlank() }
                if (nextToken != null && !seenTokens.add(nextToken)) {
                    throw IllegalStateException("The cloud API returned a repeated pagination token.")
                }
            } while (nextToken != null)
            receipts.sortedWith(compareByDescending<NativeReceipt> { it.receiptDate }
                .thenByDescending { it.receiptTime })
        }

    suspend fun saveReceipt(
        idToken: String,
        receipt: NativeReceipt,
        imageBytes: ByteArray,
        ocrRawText: String = "",
        entryMethod: String,
    ) = withContext(Dispatchers.IO) {
        require(imageBytes.isNotEmpty() && imageBytes.size <= MAX_IMAGE_BYTES) {
            "Receipt photos must be between 1 byte and 10 MB."
        }
        require(receipt.originalMimeType in SUPPORTED_IMAGE_TYPES) {
            "This receipt photo format cannot be synced."
        }

        val uploadRequest = JSONObject()
            .put("contentType", receipt.originalMimeType)
            .put("contentLength", imageBytes.size)
        val upload = apiRequest(
            "POST",
            "receipts/${receipt.id}/image-upload",
            idToken,
            uploadRequest,
        )
        if (!upload.optBoolean("alreadySaved")) {
            val uploadUrl = upload.optString("uploadUrl")
            val fields = upload.optJSONObject("fields")
                ?: throw IllegalStateException("The cloud API did not provide a receipt photo upload form.")
            if (uploadUrl.isBlank()) {
                throw IllegalStateException("The cloud API did not provide a receipt photo upload URL.")
            }
            uploadPhoto(uploadUrl, fields, receipt.originalFilename, receipt.originalMimeType, imageBytes)
        }

        val now = java.time.Instant.now().toString()
        val record = JSONObject()
            .put("id", receipt.id)
            .put("formatId", "dodla-cow-provisional-slip-v1")
            .put("milkType", "Cow")
            .put("receiptDate", receipt.receiptDate)
            .put("receiptTime", receipt.receiptTime)
            .put("shift", receipt.shift)
            .put("quantityLitres", receipt.quantityLitres)
            .put("fat", receipt.fat)
            .put("snf", receipt.snf)
            .put("clr", receipt.clr)
            .put("ratePerLitre", receipt.ratePerLitre)
            .put("totalAmount", receipt.totalAmount)
            .put("originalImageRef", receipt.id)
            .put("originalFilename", receipt.originalFilename.take(255))
            .put("originalMimeType", receipt.originalMimeType)
            .put("ocrRawText", ocrRawText.take(20_000))
            .put("verificationStatus", "verified")
            .put("verificationTimestamp", now)
            .put("createdAt", now)
            .put("updatedAt", now)
            .put("entryMethod", entryMethod)
        apiRequest("POST", "receipts", idToken, record)
    }

    suspend fun askAssistant(
        idToken: String,
        question: String,
        history: List<AssistantMessage>,
        receipts: List<NativeReceipt>,
    ): String = withContext(Dispatchers.IO) {
        val request = JSONObject()
            .put("question", question)
            .put("history", JSONArray().apply {
                history.takeLast(6).forEach { message ->
                    put(JSONObject().put("role", message.role).put("content", message.content))
                }
            })
            .put("context", buildAssistantContext(receipts))
        apiRequest("POST", "assistant", idToken, request).optString("answer")
            .takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("The assistant returned an empty answer.")
    }

    private fun apiRequest(
        method: String,
        path: String,
        idToken: String,
        body: JSONObject? = null,
    ): JSONObject {
        val connection = (URL(URL(BASE_URL), path).openConnection() as HttpURLConnection)
        try {
            connection.requestMethod = method
            connection.connectTimeout = REQUEST_TIMEOUT_MS
            connection.readTimeout = REQUEST_TIMEOUT_MS
            connection.setRequestProperty("Authorization", "Bearer $idToken")
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use {
                    it.write(body.toString().toByteArray(StandardCharsets.UTF_8))
                }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseText = stream?.use { input ->
                val output = ByteArrayOutputStream()
                input.copyTo(output)
                output.toString(StandardCharsets.UTF_8.name())
            }.orEmpty()
            if (status !in 200..299) {
                val message = runCatching { JSONObject(responseText).optString("error") }
                    .getOrNull()
                    ?.takeIf { it.isNotBlank() }
                    ?: "MilkTrack cloud request failed (HTTP $status)."
                throw IllegalStateException(message)
            }
            if (responseText.isBlank()) return JSONObject()
            return JSONObject(responseText)
        } finally {
            connection.disconnect()
        }
    }

    private fun uploadPhoto(
        uploadUrl: String,
        fields: JSONObject,
        filename: String,
        mimeType: String,
        bytes: ByteArray,
    ) {
        val boundary = "MilkTrack${java.util.UUID.randomUUID().toString().replace("-", "")}"
        val connection = (URL(uploadUrl).openConnection() as HttpURLConnection)
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = REQUEST_TIMEOUT_MS
            connection.readTimeout = REQUEST_TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            connection.outputStream.buffered().use { output ->
                for (key in fields.keys()) {
                    writePart(output, boundary, key, fields.getString(key))
                }
                output.write("--$boundary\r\n".toByteArray(StandardCharsets.UTF_8))
                output.write(
                    "Content-Disposition: form-data; name=\"file\"; filename=\"${safeFilename(filename)}\"\r\n".toByteArray(
                        StandardCharsets.UTF_8,
                    ),
                )
                output.write("Content-Type: $mimeType\r\n\r\n".toByteArray(StandardCharsets.UTF_8))
                output.write(bytes)
                output.write("\r\n--$boundary--\r\n".toByteArray(StandardCharsets.UTF_8))
            }
            val status = connection.responseCode
            if (status !in 200..299) {
                throw IllegalStateException(
                    "The receipt photo could not be uploaded to private cloud storage (HTTP $status).",
                )
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun writePart(
        output: java.io.OutputStream,
        boundary: String,
        name: String,
        value: String,
    ) {
        output.write("--$boundary\r\n".toByteArray(StandardCharsets.UTF_8))
        output.write(
            "Content-Disposition: form-data; name=\"${safeFilename(name)}\"\r\n\r\n"
                .toByteArray(StandardCharsets.UTF_8),
        )
        output.write(value.toByteArray(StandardCharsets.UTF_8))
        output.write("\r\n".toByteArray(StandardCharsets.UTF_8))
    }

    private fun parseReceipt(value: JSONObject) = NativeReceipt(
        id = value.getString("id"),
        receiptDate = value.getString("receiptDate"),
        receiptTime = value.getString("receiptTime"),
        shift = value.getString("shift"),
        quantityLitres = value.getString("quantityLitres"),
        fat = value.getString("fat"),
        snf = value.getString("snf"),
        clr = value.getString("clr"),
        ratePerLitre = value.getString("ratePerLitre"),
        totalAmount = value.getString("totalAmount"),
        originalFilename = value.getString("originalFilename"),
        originalMimeType = value.getString("originalMimeType"),
    )

    private fun buildAssistantContext(receipts: List<NativeReceipt>): JSONObject {
        val validReceipts = receipts.filter { receipt ->
            runCatching { LocalDate.parse(receipt.receiptDate) }.isSuccess
        }
        val currentMonth = YearMonth.now().toString()
        val monthly = validReceipts.groupBy { it.receiptDate.take(7) }
            .toSortedMap()
            .entries
            .toList()
            .takeLast(24)
            .map { (month, values) -> financeTotals(values).put("month", month) }
        return JSONObject()
            .put("currency", "INR")
            .put("verifiedReceipts", validReceipts.size)
            .put("totals", financeTotals(validReceipts))
            .put("monthlyTotals", JSONArray(monthly))
            .put("currentMonth", currentMonth)
    }

    private fun financeTotals(receipts: List<NativeReceipt>) = JSONObject()
        .put("receipts", receipts.size)
        .put("litres", sumDecimal(receipts.map { it.quantityLitres }, 3))
        .put("earningsInr", sumDecimal(receipts.map { it.totalAmount }, 2))

    private fun sumDecimal(values: List<String>, scale: Int): String =
        values.fold(BigDecimal.ZERO) { total, value ->
            total + (value.toBigDecimalOrNull() ?: BigDecimal.ZERO)
        }.setScale(scale, java.math.RoundingMode.HALF_UP)
            .stripTrailingZeros()
            .toPlainString()
            .let { if (it.contains('.')) it else "$it.0" }

    private fun safeFilename(value: String): String =
        value.replace(Regex("[^A-Za-z0-9._-]"), "_").take(120).ifBlank { "receipt.jpg" }

    private val SUPPORTED_IMAGE_TYPES = setOf(
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
    )
}
