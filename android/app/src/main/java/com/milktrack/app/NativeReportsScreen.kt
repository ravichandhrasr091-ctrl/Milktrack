package com.milktrack.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.milktrack.app.data.NativeAnalytics
import com.milktrack.app.data.NativeReceipt
import com.milktrack.app.data.ReportPeriod
import com.milktrack.app.data.StoredNativeReceipt
import java.math.RoundingMode
import java.time.LocalDate

@Composable
internal fun NativeReportsScreen(
    receipts: List<StoredNativeReceipt>,
    onReceiptClick: (StoredNativeReceipt) -> Unit,
) {
    val today = LocalDate.now()
    var period by remember { mutableStateOf(ReportPeriod.SevenDays) }
    var startText by remember {
        mutableStateOf(NativeAnalytics.defaultStart(today, ReportPeriod.SevenDays).toString())
    }
    val start = runCatching { LocalDate.parse(startText) }.getOrNull()
    val report = start?.let {
        NativeAnalytics.report(receipts.map(StoredNativeReceipt::receipt), NativeAnalytics.range(it, period))
    }
    val periodOptions = listOf(
        ReportPeriod.SevenDays,
        ReportPeriod.FifteenDays,
        ReportPeriod.OneMonth,
        ReportPeriod.OneYear,
    )

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 22.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            NativePageHeader(
                title = "Reports",
                subtitle = "Verified collection analytics",
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                periodOptions.forEach { option ->
                    FilterChip(
                        selected = period == option,
                        onClick = {
                            period = option
                            startText = NativeAnalytics.defaultStart(today, option).toString()
                        },
                        label = { Text(option.label, fontSize = 11.sp) },
                    )
                }
            }
        }
        item {
            OutlinedTextField(
                value = startText,
                onValueChange = { startText = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("Start date (YYYY-MM-DD)") },
                isError = start == null,
                supportingText = {
                    if (report != null) {
                        Text("End date is exclusive: ${report.range.endExclusive}")
                    } else {
                        Text("Enter a valid start date.")
                    }
                },
            )
        }
        if (report == null) {
            item { NativeEmptyState("Select a valid start date", "Use YYYY-MM-DD to choose the beginning of this report.") }
        } else {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        NativeMetricCard(
                            "Milk quantity",
                            "${report.totals.quantityLitres.decimal(2)} L",
                            "Selected period",
                            Modifier.weight(1f),
                        )
                        NativeMetricCard(
                            "Earnings",
                            "₹${report.totals.earningsInr.decimal(2)}",
                            "Verified only",
                            Modifier.weight(1f),
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        NativeMetricCard(
                            "Average rate",
                            "₹${report.totals.averageRate.decimal(2)}/L",
                            "Total ÷ quantity",
                            Modifier.weight(1f),
                        )
                        NativeMetricCard(
                            "Receipts",
                            report.totals.receiptCount.toString(),
                            "Verified records",
                            Modifier.weight(1f),
                        )
                    }
                }
            }
            item {
                NativeComparisonBar(
                    "Morning vs Night · ${period.label}",
                    report.morning.quantityLitres,
                    report.night.quantityLitres,
                    "L",
                )
            }
            item { NativeTrendChart("Daily milk quantity", report.days, { it.quantityLitres }, unitLabel = "litres") }
            item {
                NativeTrendChart(
                    "Daily earnings",
                    report.days,
                    { it.earningsInr },
                    color = androidx.compose.ui.graphics.Color(0xFF5A9B79),
                    unitLabel = "INR",
                )
            }
            item {
                NativeTrendChart("FAT trend · quantity-weighted", report.days, { it.averageFat }, unitLabel = "FAT")
            }
            item {
                NativeTrendChart("SNF trend · quantity-weighted", report.days, { it.averageSnf }, unitLabel = "SNF")
            }
            item {
                NativeTrendChart("CLR trend · quantity-weighted", report.days, { it.averageClr }, unitLabel = "CLR")
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text("Receipt details", color = NativeForest, fontWeight = FontWeight.Bold)
                    Text("${report.receipts.size} verified receipts in this period", color = NativeMuted, fontSize = 12.sp)
                }
            }
            if (report.receipts.isEmpty()) {
                item { NativeEmptyState("No verified receipts in this period", "Change the start date or choose another reporting period.") }
            } else {
                items(
                    report.receipts.reversed(),
                    key = { "report-${it.id}" },
                ) { receipt ->
                    val stored = receipts.firstOrNull { it.receipt.id == receipt.id }
                    if (stored != null) NativeReceiptCard(stored) { onReceiptClick(stored) }
                }
            }
        }
    }
}

private fun java.math.BigDecimal.decimal(scale: Int): String =
    setScale(scale, RoundingMode.HALF_UP).toPlainString()
