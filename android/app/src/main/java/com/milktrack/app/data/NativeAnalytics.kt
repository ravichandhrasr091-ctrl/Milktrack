package com.milktrack.app.data

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.temporal.ChronoUnit

internal enum class ReportPeriod(val label: String) {
    SevenDays("7 Days"),
    FifteenDays("15 Days"),
    OneMonth("1 Month"),
    OneYear("1 Year"),
}

internal data class DateRange(
    val startInclusive: LocalDate,
    val endExclusive: LocalDate,
) {
    val dayCount: Int
        get() = ChronoUnit.DAYS.between(startInclusive, endExclusive).toInt()

    fun contains(date: LocalDate): Boolean =
        !date.isBefore(startInclusive) && date.isBefore(endExclusive)
}

internal data class ShiftTotals(
    val quantityLitres: BigDecimal = BigDecimal.ZERO,
    val earningsInr: BigDecimal = BigDecimal.ZERO,
    val receipts: Int = 0,
)

internal data class DailyTotals(
    val date: LocalDate,
    val quantityLitres: BigDecimal,
    val earningsInr: BigDecimal,
    val receipts: Int,
    val averageFat: BigDecimal,
    val averageSnf: BigDecimal,
    val averageClr: BigDecimal,
)

internal data class CollectionTotals(
    val quantityLitres: BigDecimal,
    val earningsInr: BigDecimal,
    val averageRate: BigDecimal,
    val averageFat: BigDecimal,
    val averageSnf: BigDecimal,
    val averageClr: BigDecimal,
    val receiptCount: Int,
)

internal data class CollectionReport(
    val range: DateRange,
    val totals: CollectionTotals,
    val morning: ShiftTotals,
    val night: ShiftTotals,
    val days: List<DailyTotals>,
    val receipts: List<NativeReceipt>,
)

internal object NativeAnalytics {
    fun range(start: LocalDate, period: ReportPeriod): DateRange {
        val end = when (period) {
            ReportPeriod.SevenDays -> start.plusDays(7)
            ReportPeriod.FifteenDays -> start.plusDays(15)
            ReportPeriod.OneMonth -> start.plusMonths(1)
            ReportPeriod.OneYear -> start.plusYears(1)
        }
        return DateRange(start, end)
    }

    fun defaultStart(today: LocalDate, period: ReportPeriod): LocalDate =
        when (period) {
            ReportPeriod.SevenDays -> today.minusDays(6)
            ReportPeriod.FifteenDays -> today.minusDays(14)
            ReportPeriod.OneMonth -> today.minusMonths(1).plusDays(1)
            ReportPeriod.OneYear -> today.minusYears(1).plusDays(1)
        }

    fun report(
        receipts: List<NativeReceipt>,
        range: DateRange,
    ): CollectionReport {
        val filtered = receipts.filter { receipt ->
            runCatching { LocalDate.parse(receipt.receiptDate) }
                .getOrNull()
                ?.let(range::contains) == true
        }.sortedWith(compareBy<NativeReceipt> { it.receiptDate }.thenBy { it.receiptTime })

        var quantity = BigDecimal.ZERO
        var earnings = BigDecimal.ZERO
        var fatTimesQuantity = BigDecimal.ZERO
        var snfTimesQuantity = BigDecimal.ZERO
        var clrTimesQuantity = BigDecimal.ZERO
        var morning = ShiftTotals()
        var night = ShiftTotals()
        val byDay = LinkedHashMap<LocalDate, DailyAccumulator>()

        for (receipt in filtered) {
            val litres = receipt.quantityLitres.toBigDecimalOrNull() ?: continue
            val amount = receipt.totalAmount.toBigDecimalOrNull() ?: continue
            val fat = receipt.fat.toBigDecimalOrNull() ?: continue
            val snf = receipt.snf.toBigDecimalOrNull() ?: continue
            val clr = receipt.clr.toBigDecimalOrNull() ?: continue
            val date = LocalDate.parse(receipt.receiptDate)
            quantity += litres
            earnings += amount
            fatTimesQuantity += litres * fat
            snfTimesQuantity += litres * snf
            clrTimesQuantity += litres * clr

            val shiftTotals = when (receipt.shift) {
                "Morning/Day" -> morning
                "Night" -> night
                else -> null
            }
            if (shiftTotals != null) {
                val updated = shiftTotals.copy(
                    quantityLitres = shiftTotals.quantityLitres + litres,
                    earningsInr = shiftTotals.earningsInr + amount,
                    receipts = shiftTotals.receipts + 1,
                )
                if (receipt.shift == "Morning/Day") morning = updated else night = updated
            }
            val dayTotals = byDay.getOrPut(date) { DailyAccumulator() }
            dayTotals.quantityLitres += litres
            dayTotals.earningsInr += amount
            dayTotals.fatTimesQuantity += litres * fat
            dayTotals.snfTimesQuantity += litres * snf
            dayTotals.clrTimesQuantity += litres * clr
            dayTotals.receipts++
        }

        val days = (0 until range.dayCount).map { offset ->
            val date = range.startInclusive.plusDays(offset.toLong())
            val day = byDay[date] ?: DailyAccumulator()
            DailyTotals(
                date,
                day.quantityLitres,
                day.earningsInr,
                day.receipts,
                divide(day.fatTimesQuantity, day.quantityLitres, 2),
                divide(day.snfTimesQuantity, day.quantityLitres, 2),
                divide(day.clrTimesQuantity, day.quantityLitres, 2),
            )
        }
        return CollectionReport(
            range = range,
            totals = CollectionTotals(
                quantityLitres = quantity,
                earningsInr = earnings,
                averageRate = divide(earnings, quantity, 2),
                averageFat = divide(fatTimesQuantity, quantity, 2),
                averageSnf = divide(snfTimesQuantity, quantity, 2),
                averageClr = divide(clrTimesQuantity, quantity, 2),
                receiptCount = filtered.size,
            ),
            morning = morning,
            night = night,
            days = days,
            receipts = filtered,
        )
    }

    fun currentDashboard(
        receipts: List<NativeReceipt>,
        today: LocalDate,
    ): CollectionReport {
        val report = report(receipts, DateRange(today, today.plusDays(1)))
        return report.copy(
            range = DateRange(today, today.plusDays(1)),
            days = report.days,
        )
    }

    private fun divide(
        numerator: BigDecimal,
        denominator: BigDecimal,
        scale: Int,
    ): BigDecimal =
        if (denominator.compareTo(BigDecimal.ZERO) == 0) BigDecimal.ZERO.setScale(scale)
        else numerator.divide(denominator, scale, RoundingMode.HALF_UP)

    private data class DailyAccumulator(
        var quantityLitres: BigDecimal = BigDecimal.ZERO,
        var earningsInr: BigDecimal = BigDecimal.ZERO,
        var fatTimesQuantity: BigDecimal = BigDecimal.ZERO,
        var snfTimesQuantity: BigDecimal = BigDecimal.ZERO,
        var clrTimesQuantity: BigDecimal = BigDecimal.ZERO,
        var receipts: Int = 0,
    )
}
