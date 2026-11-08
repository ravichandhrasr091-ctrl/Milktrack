package com.milktrack.app.data

import java.time.LocalDate
import java.time.LocalTime

internal data class NativeReceiptDraft(
    val receiptDate: String = "",
    val receiptTime: String = "",
    val shift: String = "",
    val milkType: String = "",
    val quantityLitres: String = "",
    val fat: String = "",
    val snf: String = "",
    val clr: String = "",
    val ratePerLitre: String = "",
    val totalAmount: String = "",
    val supplierCode: String = "",
    val mccCode: String = "",
    val vlccCode: String = "",
)

internal data class NativeReceiptAnalysis(
    val recognized: Boolean,
    val rawText: String,
    val draft: NativeReceiptDraft,
    val rejectionReason: String? = null,
)

internal object NativeReceiptParser {
    private val numeric = """(\d+(?:\.\d+)?)(?![\d.,])"""

    fun parse(rawText: String): NativeReceiptAnalysis {
        val text = rawText.replace('\r', '\n')
        val recognized = Regex("""\bdodla\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) &&
            Regex("""\bcow\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) &&
            (
                Regex("""\bprovisional\s+acknowledg(?:e)?ment\b""", RegexOption.IGNORE_CASE)
                    .containsMatchIn(text) ||
                    Regex("""\bquantity\s*:""", RegexOption.IGNORE_CASE).containsMatchIn(text)
                )
        if (!recognized) {
            return NativeReceiptAnalysis(
                recognized = false,
                rawText = rawText,
                draft = NativeReceiptDraft(),
                rejectionReason = "This image is not clearly a supported Dodla Cow collection receipt.",
            )
        }

        val printedDate = capture(text, """\bdate\s*:\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})""")
        val date = printedDate?.let(::normalizeDate).orEmpty()
        val printedTime = capture(
            text,
            """\b(?:time|ting|t1me)\s*:\s*(\d{1,2}:\d{2}(?::\d{2})?)""",
        )
        val time = printedTime?.let(::normalizeTime).orEmpty()
        val shift = time.takeIf(String::isNotEmpty)?.let {
            val hour = it.take(2).toInt()
            if (hour in 6..17) "Morning/Day" else "Night"
        }.orEmpty()

        return NativeReceiptAnalysis(
            recognized = true,
            rawText = rawText,
            draft = NativeReceiptDraft(
                receiptDate = date,
                receiptTime = time,
                shift = shift,
                milkType = capture(text, """\bmilk\s*type\s*:\s*(cow)\b""")
                    ?.replaceFirstChar { it.uppercase() }.orEmpty(),
                quantityLitres = capture(text, """\bquantity\s*:\s*$numeric""").orEmpty(),
                fat = capture(text, """\bfat\s*:\s*$numeric""").orEmpty(),
                snf = capture(text, """\b(?:snf|ske)\s*:\s*$numeric""").orEmpty(),
                clr = capture(text, """\bclr\s*:\s*$numeric""").orEmpty(),
                ratePerLitre = capture(
                    text,
                    """\brate\s*\(?(?:rs\.?)?\)?\s*:\s*$numeric""",
                ).orEmpty(),
                totalAmount = capture(text, """\bamount\s*:\s*$numeric""").orEmpty(),
                supplierCode = capture(text, """\bcode\s*:\s*(\d+\s+\d{4,})""").orEmpty(),
                mccCode = capture(text, """\b(?:mcc|hcc|ncc)\s*code\s*:\s*([A-Z0-9_-]+)""")
                    .orEmpty(),
                vlccCode = capture(text, """\b(?:vlcc|ulcc)\s*code\s*:\s*([A-Z0-9_-]+)""")
                    .orEmpty(),
            ),
        )
    }

    private fun capture(text: String, expression: String): String? =
        Regex(expression, RegexOption.IGNORE_CASE).find(text)?.groupValues?.getOrNull(1)?.trim()

    private fun normalizeDate(value: String): String = runCatching {
        val parts = value.split('/', '-')
        val year = parts[2].let { if (it.length == 2) "20$it" else it }.toInt()
        LocalDate.of(year, parts[1].toInt(), parts[0].toInt()).toString()
    }.getOrDefault("")

    private fun normalizeTime(value: String): String = runCatching {
        val pieces = value.split(':').map(String::toInt)
        LocalTime.of(pieces[0], pieces[1], pieces.getOrElse(2) { 0 })
            .toString()
            .take(5)
            .padStart(5, '0')
    }.getOrDefault("")
}
