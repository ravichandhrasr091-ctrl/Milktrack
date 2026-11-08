package com.milktrack.app.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

internal data class NativeImageCheck(
    val byteCount: Int,
    val width: Int,
    val height: Int,
    val blurVariance: Double,
)

internal data class NativeOcrResult(
    val analysis: NativeReceiptAnalysis,
    val imageCheck: NativeImageCheck?,
    val error: String? = null,
)

internal object NativeOcrService {
    private const val MAX_IMAGE_BYTES = 10 * 1024 * 1024
    private const val MIN_IMAGE_EDGE = 720
    private const val MIN_LAPLACIAN_VARIANCE = 18.0
    private val supportedTypes = setOf(
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
    )

    suspend fun analyze(
        context: Context,
        uri: Uri,
        mimeType: String,
    ): NativeOcrResult = withContext(Dispatchers.IO) {
        if (mimeType !in supportedTypes) {
            return@withContext rejected("Choose a JPEG, PNG, WebP, or HEIF receipt photo.")
        }

        val bytes = try {
            readImageBytes(context, uri)
        } catch (error: Exception) {
            return@withContext rejected(
                error.message ?: "MilkTrack could not read the selected photo.",
            )
        }
        val imageCheck = try {
            checkImage(context, uri, bytes.size)
        } catch (error: Exception) {
            return@withContext rejected(
                error.message ?: "The selected photo could not be checked.",
            )
        }
        if (imageCheck.width < MIN_IMAGE_EDGE || imageCheck.height < MIN_IMAGE_EDGE) {
            return@withContext NativeOcrResult(
                NativeReceiptAnalysis(
                    recognized = false,
                    rawText = "",
                    draft = NativeReceiptDraft(),
                    rejectionReason = "This photo is too small to read clearly. Retake it closer to the receipt.",
                ),
                imageCheck,
            )
        }
        if (imageCheck.blurVariance < MIN_LAPLACIAN_VARIANCE) {
            return@withContext NativeOcrResult(
                NativeReceiptAnalysis(
                    recognized = false,
                    rawText = "",
                    draft = NativeReceiptDraft(),
                    rejectionReason = "This photo appears blurry. Retake the receipt in focus with steady hands.",
                ),
                imageCheck,
            )
        }

        val rawText = try {
            val input = InputImage.fromFilePath(context, uri)
            val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            try {
                recognizer.process(input).await().text
            } finally {
                recognizer.close()
            }
        } catch (error: Exception) {
            return@withContext rejected(
                error.message ?: "MilkTrack could not read text from this photo.",
                imageCheck,
            )
        }

        if (rawText.count(Char::isLetterOrDigit) < 20) {
            return@withContext NativeOcrResult(
                NativeReceiptAnalysis(
                    recognized = false,
                    rawText = rawText,
                    draft = NativeReceiptDraft(),
                    rejectionReason = "The receipt text is incomplete or unreadable. Retake the full receipt.",
                ),
                imageCheck,
            )
        }
        NativeOcrResult(NativeReceiptParser.parse(rawText), imageCheck)
    }

    private fun readImageBytes(context: Context, uri: Uri): ByteArray {
        val output = ByteArrayOutputStream()
        context.contentResolver.openInputStream(uri)?.use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var total = 0
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                require(total <= MAX_IMAGE_BYTES) { "Receipt photos must be 10 MB or smaller." }
                output.write(buffer, 0, count)
            }
        } ?: throw IllegalStateException("MilkTrack could not open the selected photo.")
        require(output.size() > 0) { "The selected photo is empty." }
        return output.toByteArray()
    }

    private fun checkImage(
        context: Context,
        uri: Uri,
        byteCount: Int,
    ): NativeImageCheck {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, bounds)
        } ?: throw IllegalStateException("The selected photo is not a readable image.")
        require(bounds.outWidth > 0 && bounds.outHeight > 0) {
            "The selected photo is not a supported image."
        }
        var sampleSize = 1
        while (bounds.outWidth / sampleSize > 1200 || bounds.outHeight / sampleSize > 1600) {
            sampleSize *= 2
        }
        val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
        val bitmap = context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, options)
        } ?: throw IllegalStateException("The selected photo could not be decoded.")
        return try {
            NativeImageCheck(
                byteCount = byteCount,
                width = bounds.outWidth,
                height = bounds.outHeight,
                blurVariance = laplacianVariance(bitmap),
            )
        } finally {
            bitmap.recycle()
        }
    }

    private fun laplacianVariance(bitmap: Bitmap): Double {
        val step = if (bitmap.width * bitmap.height > 700_000) 2 else 1
        var sum = 0.0
        var sumSquared = 0.0
        var count = 0
        for (y in step until bitmap.height - step step step) {
            for (x in step until bitmap.width - step step step) {
                val center = gray(bitmap.getPixel(x, y))
                val laplacian = gray(bitmap.getPixel(x - step, y)) +
                    gray(bitmap.getPixel(x + step, y)) +
                    gray(bitmap.getPixel(x, y - step)) +
                    gray(bitmap.getPixel(x, y + step)) -
                    4.0 * center
                sum += laplacian
                sumSquared += laplacian * laplacian
                count++
            }
        }
        if (count == 0) return 0.0
        val mean = sum / count
        return (sumSquared / count - mean * mean).coerceAtLeast(0.0)
    }

    private fun gray(color: Int): Double =
        ((color shr 16 and 0xff) * 0.299) +
            ((color shr 8 and 0xff) * 0.587) +
            ((color and 0xff) * 0.114)

    private fun rejected(
        message: String,
        imageCheck: NativeImageCheck? = null,
    ) = NativeOcrResult(
        analysis = NativeReceiptAnalysis(
            recognized = false,
            rawText = "",
            draft = NativeReceiptDraft(),
            rejectionReason = message,
        ),
        imageCheck = imageCheck,
        error = message,
    )

    private suspend fun com.google.android.gms.tasks.Task<com.google.mlkit.vision.text.Text>.await() =
        suspendCancellableCoroutine { continuation ->
            addOnSuccessListener { result ->
                if (continuation.isActive) continuation.resume(result)
            }
            addOnFailureListener { error ->
                if (continuation.isActive) continuation.resumeWithException(error)
            }
            addOnCanceledListener {
                if (continuation.isActive) {
                    continuation.resumeWithException(
                        IllegalStateException("Receipt text recognition was cancelled."),
                    )
                }
            }
        }
}
