package com.milktrack.app.data

import java.io.ByteArrayOutputStream
import java.math.RoundingMode
import java.time.LocalDate
import java.time.Year
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

internal data class WorkbookSheet(
    val name: String,
    val headers: List<String>,
    val rows: List<List<String>>,
)

internal object NativeWorkbook {
    private val receiptHeaders = listOf(
        "Receipt ID",
        "Date",
        "Time",
        "Shift",
        "Milk Type",
        "Quantity (L)",
        "FAT",
        "SNF",
        "CLR",
        "Rate (INR/L)",
        "Amount (INR)",
        "Supplier Code",
        "MCC Code",
        "VLCC Code",
        "Entry Method",
        "Verified At",
    )

    fun master(receipts: List<NativeReceipt>, today: LocalDate): ByteArray =
        createWorkbook(receipts, today, null)

    fun selectedPeriod(
        receipts: List<NativeReceipt>,
        range: DateRange,
        today: LocalDate,
    ): ByteArray = createWorkbook(
        receipts = receipts.filter {
            runCatching { range.contains(LocalDate.parse(it.receiptDate)) }.getOrDefault(false)
        },
        today = today,
        selectedRange = range,
    )

    fun masterSheets(
        receipts: List<NativeReceipt>,
        today: LocalDate,
        selectedRange: DateRange? = null,
    ): List<WorkbookSheet> {
        val verified = receipts.sortedWith(compareBy<NativeReceipt> { it.receiptDate }.thenBy { it.receiptTime })
        val selected = selectedRange?.let { range ->
            verified.filter { runCatching { range.contains(LocalDate.parse(it.receiptDate)) }.getOrDefault(false) }
        } ?: verified
        val allRecords = selected.map(::receiptRow)
        val daily = selected.groupBy { it.receiptDate }.toSortedMap().map { (date, values) ->
            val report = NativeAnalytics.report(
                values,
                DateRange(LocalDate.parse(date), LocalDate.parse(date).plusDays(1)),
            )
            listOf(
                date,
                report.totals.quantityLitres.decimalText(),
                report.totals.earningsInr.decimalText(),
                report.totals.receiptCount.toString(),
                report.totals.averageRate.decimalText(),
                report.morning.quantityLitres.decimalText(),
                report.morning.earningsInr.decimalText(),
                report.night.quantityLitres.decimalText(),
                report.night.earningsInr.decimalText(),
            )
        }
        val morning = selected.filter { it.shift == "Morning/Day" }.map(::receiptRow)
        val night = selected.filter { it.shift == "Night" }.map(::receiptRow)
        val periodRows = ReportPeriod.entries.map { period ->
            val start = selectedRange?.startInclusive ?: NativeAnalytics.defaultStart(today, period)
            val report = NativeAnalytics.report(selected, NativeAnalytics.range(start, period))
            listOf(
                period.label,
                report.range.startInclusive.toString(),
                report.range.endExclusive.toString(),
                report.totals.quantityLitres.decimalText(),
                report.totals.earningsInr.decimalText(),
                report.totals.averageRate.decimalText(),
                report.totals.receiptCount.toString(),
            )
        }
        val years = selected.mapNotNull {
            runCatching { Year.parse(it.receiptDate.take(4)) }.getOrNull()
        }.distinct().sorted()
        val yearlyRows = years.map { year ->
            val report = NativeAnalytics.report(
                selected,
                DateRange(year.atDay(1), year.plusYears(1).atDay(1)),
            )
            listOf(
                year.toString(),
                report.totals.quantityLitres.decimalText(),
                report.totals.earningsInr.decimalText(),
                report.totals.averageRate.decimalText(),
                report.totals.receiptCount.toString(),
                report.totals.averageFat.decimalText(),
                report.totals.averageSnf.decimalText(),
                report.totals.averageClr.decimalText(),
            )
        }

        return listOf(
            WorkbookSheet("All Records", receiptHeaders, allRecords),
            WorkbookSheet(
                "Daily Summary",
                listOf("Date", "Quantity (L)", "Earnings (INR)", "Receipts", "Average Rate", "Morning L", "Morning INR", "Night L", "Night INR"),
                daily,
            ),
            WorkbookSheet("Morning Shift", receiptHeaders, morning),
            WorkbookSheet("Night Shift", receiptHeaders, night),
            WorkbookSheet(
                "Period Reports",
                listOf("Period", "Start (inclusive)", "End (exclusive)", "Quantity (L)", "Earnings (INR)", "Average Rate", "Receipts"),
                periodRows,
            ),
            WorkbookSheet(
                "Yearly Summary",
                listOf("Year", "Quantity (L)", "Earnings (INR)", "Average Rate", "Receipts", "Weighted FAT", "Weighted SNF", "Weighted CLR"),
                yearlyRows,
            ),
        )
    }

    private fun createWorkbook(
        receipts: List<NativeReceipt>,
        today: LocalDate,
        selectedRange: DateRange?,
    ): ByteArray {
        val sheets = masterSheets(receipts, today, selectedRange)
        val output = ByteArrayOutputStream()
        ZipOutputStream(output).use { zip ->
            zip.setLevel(6)
            write(zip, "[Content_Types].xml", contentTypes(sheets.size))
            write(zip, "_rels/.rels", rootRelationships())
            write(zip, "xl/workbook.xml", workbookXml(sheets))
            write(zip, "xl/_rels/workbook.xml.rels", workbookRelationships(sheets.size))
            sheets.forEachIndexed { index, sheet ->
                write(zip, "xl/worksheets/sheet${index + 1}.xml", sheetXml(sheet))
            }
        }
        return output.toByteArray()
    }

    private fun receiptRow(receipt: NativeReceipt) = listOf(
        receipt.id,
        receipt.receiptDate,
        receipt.receiptTime,
        receipt.shift,
        "Cow",
        receipt.quantityLitres,
        receipt.fat,
        receipt.snf,
        receipt.clr,
        receipt.ratePerLitre,
        receipt.totalAmount,
        receipt.supplierCode.orEmpty(),
        receipt.mccCode.orEmpty(),
        receipt.vlccCode.orEmpty(),
        receipt.entryMethod,
        receipt.verificationTimestamp.orEmpty(),
    )

    private fun String.xmlEscape(): String = replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&apos;")
        .filter { it == '\t' || it == '\n' || it == '\r' || it >= ' ' }

    private fun columnName(index: Int): String {
        var value = index + 1
        var result = ""
        while (value > 0) {
            val remainder = (value - 1) % 26
            result = ('A'.code + remainder).toChar() + result
            value = (value - 1) / 26
        }
        return result
    }

    private fun sheetXml(sheet: WorkbookSheet): String {
        val rows = listOf(sheet.headers) + sheet.rows
        val xmlRows = rows.mapIndexed { rowIndex, row ->
            val cells = row.mapIndexed { columnIndex, value ->
                val ref = "${columnName(columnIndex)}${rowIndex + 1}"
                val numeric = rowIndex > 0 && value.matches(Regex("""\d+(?:\.\d+)?"""))
                if (numeric) {
                    """<c r="$ref" t="n"><v>${value.xmlEscape()}</v></c>"""
                } else {
                    """<c r="$ref" t="inlineStr"><is><t xml:space="preserve">${value.xmlEscape()}</t></is></c>"""
                }
            }.joinToString("")
            """<row r="${rowIndex + 1}">$cells</row>"""
        }.joinToString("")
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>$xmlRows</sheetData></worksheet>"""
    }

    private fun contentTypes(count: Int): String {
        val sheets = (1..count).joinToString("") {
            """<Override PartName="/xl/worksheets/sheet$it.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"""
        }
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>$sheets</Types>"""
    }

    private fun rootRelationships(): String =
        """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"""

    private fun workbookXml(sheets: List<WorkbookSheet>): String {
        val sheetTags = sheets.mapIndexed { index, sheet ->
            """<sheet name="${sheet.name.xmlEscape()}" sheetId="${index + 1}" r:id="rId${index + 1}"/>"""
        }.joinToString("")
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>$sheetTags</sheets></workbook>"""
    }

    private fun workbookRelationships(count: Int): String {
        val items = (1..count).joinToString("") {
            """<Relationship Id="rId$it" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet$it.xml"/>"""
        }
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">$items</Relationships>"""
    }

    private fun write(zip: ZipOutputStream, name: String, value: String) {
        zip.putNextEntry(ZipEntry(name))
        zip.write(value.toByteArray(Charsets.UTF_8))
        zip.closeEntry()
    }

    private fun java.math.BigDecimal.decimalText(): String =
        stripTrailingZeros().toPlainString().ifBlank { "0" }
}
