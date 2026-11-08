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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Collections
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.milktrack.app.data.NativeAnalytics
import com.milktrack.app.data.StoredNativeReceipt
import java.math.RoundingMode
import java.time.LocalDate

@Composable
internal fun NativeHomeScreen(
    receipts: List<StoredNativeReceipt>,
    loading: Boolean,
    syncMessage: String?,
    isError: Boolean,
    onRefresh: () -> Unit,
    onCapture: () -> Unit,
    onUpload: () -> Unit,
    onOpenReceipts: () -> Unit,
    onOpenAssistant: () -> Unit,
    onReceiptClick: (StoredNativeReceipt) -> Unit,
) {
    val today = LocalDate.now()
    val values = receipts.map(StoredNativeReceipt::receipt)
    val receiptDates = values.mapNotNull {
        runCatching { LocalDate.parse(it.receiptDate) }.getOrNull()
    }
    val todayReport = NativeAnalytics.currentDashboard(values, today)
    val allReport = if (values.isEmpty()) todayReport else NativeAnalytics.report(
        values,
        com.milktrack.app.data.DateRange(
            receiptDates.minOrNull() ?: today,
            (receiptDates.maxOrNull() ?: today).plusDays(1),
        ),
    )
    val weekly = NativeAnalytics.report(
        values,
        NativeAnalytics.range(
            NativeAnalytics.defaultStart(today, com.milktrack.app.data.ReportPeriod.SevenDays),
            com.milktrack.app.data.ReportPeriod.SevenDays,
        ),
    )

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 22.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        item {
            NativePageHeader(
                title = "Today’s collection",
                subtitle = today.toString(),
                trailing = {
                    IconButton(onClick = onRefresh, enabled = !loading) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh records", tint = NativeForest)
                    }
                },
            )
        }
        syncMessage?.let { message -> item { NativeStatus(message, error = isError) } }
        if (loading && receipts.isEmpty()) {
            item { NativeLoading() }
        } else if (receipts.isEmpty()) {
            item {
                NativeEmptyState(
                    "Your register is ready",
                    "Capture or upload a Dodla Cow receipt. Only receipts you verify are included in totals.",
                )
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                NativeMetricCard(
                    "Today’s milk",
                    "${todayReport.totals.quantityLitres.decimal(2)} L",
                    "${todayReport.totals.receiptCount} verified receipts",
                    Modifier.weight(1f),
                )
                NativeMetricCard(
                    "Today’s earnings",
                    "₹${todayReport.totals.earningsInr.decimal(2)}",
                    "Verified only",
                    Modifier.weight(1f),
                )
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                NativeMetricCard(
                    "All receipts",
                    allReport.totals.receiptCount.toString(),
                    "Verified records",
                    Modifier.weight(1f),
                )
                NativeMetricCard(
                    "Average rate",
                    "₹${allReport.totals.averageRate.decimal(2)}/L",
                    "Total earnings ÷ litres",
                    Modifier.weight(1f),
                )
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                Button(
                    onClick = onCapture,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = NativeForest),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 13.dp),
                ) {
                    Icon(Icons.Default.AddAPhoto, contentDescription = null)
                    Text(" Capture receipt", maxLines = 1, fontSize = 12.sp)
                }
                OutlinedButton(
                    onClick = onUpload,
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 13.dp),
                ) {
                    Icon(Icons.Default.Collections, contentDescription = null)
                    Text(" Upload receipt", maxLines = 1, fontSize = 12.sp)
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Today by shift", color = NativeForest, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    NativeMetricCard(
                        "Morning",
                        "${todayReport.morning.quantityLitres.decimal(2)} L",
                        "₹${todayReport.morning.earningsInr.decimal(2)} · ${todayReport.morning.receipts} receipts",
                        Modifier.weight(1f),
                    )
                    NativeMetricCard(
                        "Night",
                        "${todayReport.night.quantityLitres.decimal(2)} L",
                        "₹${todayReport.night.earningsInr.decimal(2)} · ${todayReport.night.receipts} receipts",
                        Modifier.weight(1f),
                    )
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("This week", color = NativeForest, fontWeight = FontWeight.Bold)
                NativeTrendChart(
                    "Milk collected",
                    weekly.days,
                    { it.quantityLitres },
                    unitLabel = "litres",
                )
                NativeTrendChart(
                    "Verified earnings",
                    weekly.days,
                    { it.earningsInr },
                    color = Color(0xFF5A9B79),
                    unitLabel = "INR",
                )
                NativeComparisonBar(
                    "Morning vs Night · 7 days",
                    weekly.morning.quantityLitres,
                    weekly.night.quantityLitres,
                    "L",
                )
            }
        }
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("Recent activity", color = NativeForest, fontWeight = FontWeight.Bold)
                androidx.compose.material3.TextButton(onClick = onOpenReceipts) { Text("All receipts") }
            }
        }
        if (values.isNotEmpty()) {
            items(receipts.take(5), key = { it.receipt.id }) { stored ->
                NativeReceiptCard(stored, onClick = { onReceiptClick(stored) })
            }
        }
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = NativeMint),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(15.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("MilkTrack Assistant", color = NativeForest, fontWeight = FontWeight.SemiBold)
                        Text(
                            "Ask about your verified totals. Photos and individual receipts are not sent.",
                            color = NativeMuted,
                            fontSize = 12.sp,
                        )
                    }
                    IconButton(onClick = onOpenAssistant) {
                        Icon(Icons.Default.AutoAwesome, contentDescription = "Open AI assistant", tint = NativeForest)
                    }
                }
            }
        }
    }
}

private fun java.math.BigDecimal.decimal(scale: Int): String =
    setScale(scale, RoundingMode.HALF_UP).toPlainString()
