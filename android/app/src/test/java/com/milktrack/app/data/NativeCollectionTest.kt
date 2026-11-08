package com.milktrack.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.ByteArrayInputStream
import java.time.LocalDate
import java.util.zip.ZipInputStream

class NativeCollectionTest {
    @Test
    fun parserKeepsPrintedDecimalTextExactly() {
        val parsed = NativeReceiptParser.parse(
            """
                Dodla
                Provisional Acknowledgement
                Milk Type: Cow
                Date: 08/11/2026
                Time: 7:05
                Quantity: 1.2
                Fat: 4.0
                SNF: 8.5
                CLR: 29.0
                Rate (Rs): 36.50
                Amount: 43.80
            """.trimIndent(),
        )

        assertTrue(parsed.recognized)
        assertEquals("1.2", parsed.draft.quantityLitres)
        assertEquals("4.0", parsed.draft.fat)
        assertEquals("8.5", parsed.draft.snf)
        assertEquals("43.80", parsed.draft.totalAmount)
        assertEquals("2026-11-08", parsed.draft.receiptDate)
        assertEquals("07:05", parsed.draft.receiptTime)
        assertEquals("Morning/Day", parsed.draft.shift)
    }

    @Test
    fun parserDoesNotGuessOrConvertCommaDecimals() {
        val parsed = NativeReceiptParser.parse(
            """
                Dodla Cow Quantity receipt
                Quantity: 1,2
                Fat: 4.0
            """.trimIndent(),
        )

        assertTrue(parsed.recognized)
        assertEquals("", parsed.draft.quantityLitres)
        assertEquals("", parsed.draft.receiptDate)
        assertEquals("", parsed.draft.receiptTime)
    }

    @Test
    fun parserRejectsUnsupportedReceiptFormats() {
        val parsed = NativeReceiptParser.parse("Local shop bill Quantity: 1.2")
        assertFalse(parsed.recognized)
        assertTrue(parsed.rejectionReason.orEmpty().contains("Dodla Cow"))
    }

    @Test
    fun reportUsesExclusiveEndAndWeightedAverages() {
        val start = LocalDate.parse("2026-11-01")
        val receipts = listOf(
            receipt("one", "2026-11-01", "Morning/Day", "1.2", "40.0", "9.0", "30.0", "60.00"),
            receipt("two", "2026-11-02", "Night", "3.0", "30.0", "8.0", "28.0", "150.00"),
            receipt("outside", "2026-11-08", "Night", "9.0", "9.0", "9.0", "9.0", "9.00"),
        )

        val report = NativeAnalytics.report(
            receipts,
            NativeAnalytics.range(start, ReportPeriod.SevenDays),
        )

        assertEquals(LocalDate.parse("2026-11-08"), report.range.endExclusive)
        assertEquals(2, report.totals.receiptCount)
        assertEquals("4.2", report.totals.quantityLitres.stripTrailingZeros().toPlainString())
        assertEquals("210.00", report.totals.earningsInr.setScale(2).toPlainString())
        assertEquals("50.00", report.totals.averageRate.setScale(2).toPlainString())
        assertEquals("32.86", report.totals.averageFat.toPlainString())
        assertEquals("8.29", report.totals.averageSnf.toPlainString())
        assertEquals("28.57", report.totals.averageClr.toPlainString())
        assertEquals(7, report.days.size)
        assertEquals(1, report.morning.receipts)
        assertEquals(1, report.night.receipts)
    }

    @Test
    fun reportPeriodsUseCalendarBoundariesAndSelectedStartDate() {
        val january = LocalDate.parse("2024-01-31")
        assertEquals(
            LocalDate.parse("2024-02-29"),
            NativeAnalytics.range(january, ReportPeriod.OneMonth).endExclusive,
        )
        assertEquals(
            LocalDate.parse("2025-01-01"),
            NativeAnalytics.range(LocalDate.parse("2024-01-01"), ReportPeriod.OneYear).endExclusive,
        )
        assertEquals(
            LocalDate.parse("2024-01-02"),
            NativeAnalytics.defaultStart(LocalDate.parse("2024-01-08"), ReportPeriod.SevenDays),
        )
    }

    @Test
    fun workbookContainsTheSixRequiredSheetsAndExactReceiptDecimals() {
        val receipt = receipt(
            "receipt-id",
            "2026-11-08",
            "Morning/Day",
            "1.20",
            "4.00",
            "8.50",
            "29.0",
            "43.80",
        )
        val bytes = NativeWorkbook.master(listOf(receipt), LocalDate.parse("2026-11-08"))
        val files = mutableMapOf<String, String>()
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                files[entry.name] = zip.readBytes().toString(Charsets.UTF_8)
                zip.closeEntry()
            }
        }

        val workbook = files.getValue("xl/workbook.xml")
        listOf(
            "All Records",
            "Daily Summary",
            "Morning Shift",
            "Night Shift",
            "Period Reports",
            "Yearly Summary",
        ).forEach { assertTrue(workbook.contains(it)) }
        val allRecords = files.getValue("xl/worksheets/sheet1.xml")
        assertTrue(allRecords.contains(">1.20<"))
        assertTrue(allRecords.contains(">43.80<"))
        assertFalse(allRecords.contains("sample"))
    }

    @Test
    fun encryptedBackupRoundTripsVerifiedReceiptAndRejectsWrongPassword() {
        val receipt = receipt(
            "f1b29868-1824-4d81-88f8-16cbd3238c91",
            "2026-11-08",
            "Morning/Day",
            "1.20",
            "4.00",
            "8.50",
            "29.0",
            "43.80",
        ).copy(originalMimeType = "image/jpeg")
        val image = byteArrayOf(1, 2, 3, 4)
        val stored = StoredNativeReceipt(receipt, "synced", null)
        val output = ByteArrayOutputStream()

        NativeBackup.write(
            output,
            listOf(stored),
            mapOf(receipt.id to image),
            "secure-passphrase".toCharArray(),
        )

        val restored = NativeBackup.read(
            ByteArrayInputStream(output.toByteArray()),
            "secure-passphrase".toCharArray(),
        ).receipts.single()
        assertEquals("1.20", restored.receipt.quantityLitres)
        assertEquals("43.80", restored.receipt.totalAmount)
        assertTrue(image.contentEquals(restored.imageBytes))
        assertThrows(IllegalArgumentException::class.java) {
            NativeBackup.read(
                ByteArrayInputStream(output.toByteArray()),
                "incorrect-password".toCharArray(),
            )
        }
    }

    private fun receipt(
        id: String,
        date: String,
        shift: String,
        litres: String,
        fat: String,
        snf: String,
        clr: String,
        amount: String,
    ) = NativeReceipt(
        id = id,
        receiptDate = date,
        receiptTime = if (shift == "Morning/Day") "07:00" else "19:00",
        shift = shift,
        quantityLitres = litres,
        fat = fat,
        snf = snf,
        clr = clr,
        ratePerLitre = "50",
        totalAmount = amount,
        originalFilename = "$id.jpg",
        originalMimeType = "image/jpeg",
        verificationTimestamp = "2026-11-08T10:00:00Z",
    )
}
