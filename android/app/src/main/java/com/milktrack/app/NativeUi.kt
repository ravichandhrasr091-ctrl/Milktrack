package com.milktrack.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.milktrack.app.data.DailyTotals
import java.math.BigDecimal

internal val NativeForest = Color(0xFF153D2E)
internal val NativeMint = Color(0xFFD9F0E2)
internal val NativeBackground = Color(0xFFF5F8F5)
internal val NativeMuted = Color(0xFF58675F)
internal val NativeLine = Color(0xFFE5ECE6)
internal val NativeError = Color(0xFF8A281B)

@Composable
internal fun NativeMetricCard(
    title: String,
    value: String,
    caption: String,
    modifier: Modifier = Modifier,
    accent: Color = NativeForest,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(
            modifier = Modifier.padding(15.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(title, color = NativeMuted, fontSize = 12.sp)
            Text(value, color = accent, fontSize = 19.sp, fontWeight = FontWeight.Bold)
            Text(caption, color = NativeMuted, fontSize = 11.sp)
        }
    }
}

@Composable
internal fun NativeSectionTitle(title: String, subtitle: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(title, color = NativeForest, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        subtitle?.let { Text(it, color = NativeMuted, fontSize = 13.sp) }
    }
}

@Composable
internal fun NativeStatus(message: String, error: Boolean = false) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = if (error) Color(0xFFFFECE8) else NativeMint,
        shape = RoundedCornerShape(12.dp),
    ) {
        Text(
            message,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            color = if (error) NativeError else NativeForest,
            fontSize = 12.sp,
        )
    }
}

@Composable
internal fun NativeEmptyState(title: String, message: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Box(
                modifier = Modifier.size(36.dp).background(NativeMint, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text("M", color = NativeForest, fontWeight = FontWeight.Bold)
            }
            Text(title, color = NativeForest, fontWeight = FontWeight.Bold)
            Text(message, color = NativeMuted, fontSize = 13.sp, lineHeight = 19.sp)
        }
    }
}

@Composable
internal fun NativeLoading() {
    Box(
        modifier = Modifier.fillMaxWidth().padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(modifier = Modifier.size(28.dp), strokeWidth = 3.dp)
    }
}

@Composable
internal fun NativeTrendChart(
    title: String,
    values: List<DailyTotals>,
    selector: (DailyTotals) -> BigDecimal,
    color: Color = NativeForest,
    unitLabel: String,
) {
    val chartValues = values.map { selector(it).toFloat().coerceAtLeast(0f) }
    val maximum = chartValues.maxOrNull()?.takeIf { it > 0 } ?: 1f
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(title, color = NativeForest, fontWeight = FontWeight.SemiBold)
                Text(unitLabel, color = NativeMuted, fontSize = 11.sp)
            }
            Canvas(
                modifier = Modifier.fillMaxWidth().height(126.dp).semantics {
                    contentDescription = "$title chart, ${values.size} daily values"
                },
            ) {
                val left = 5.dp.toPx()
                val right = size.width - 5.dp.toPx()
                val top = 10.dp.toPx()
                val bottom = size.height - 12.dp.toPx()
                drawLine(NativeLine, androidx.compose.ui.geometry.Offset(left, bottom), androidx.compose.ui.geometry.Offset(right, bottom), 1.dp.toPx())
                for (line in 1..3) {
                    val y = bottom - (bottom - top) * line / 4f
                    drawLine(NativeLine, androidx.compose.ui.geometry.Offset(left, y), androidx.compose.ui.geometry.Offset(right, y), 1.dp.toPx())
                }
                if (chartValues.isEmpty()) return@Canvas
                val path = Path()
                chartValues.forEachIndexed { index, value ->
                    val x = if (chartValues.size == 1) (left + right) / 2f
                    else left + (right - left) * index / (chartValues.size - 1)
                    val y = bottom - (bottom - top) * value / maximum
                    if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
                }
                drawPath(path, color, style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round))
                if (chartValues.size <= 15) {
                    chartValues.forEachIndexed { index, value ->
                        val x = if (chartValues.size == 1) (left + right) / 2f
                        else left + (right - left) * index / (chartValues.size - 1)
                        val y = bottom - (bottom - top) * value / maximum
                        drawCircle(color, radius = 3.dp.toPx(), center = androidx.compose.ui.geometry.Offset(x, y))
                    }
                }
            }
            if (values.isNotEmpty()) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(values.first().date.toString(), color = NativeMuted, fontSize = 10.sp)
                    if (values.size > 2) {
                        Text(values[values.size / 2].date.toString(), color = NativeMuted, fontSize = 10.sp)
                    }
                    Text(values.last().date.toString(), color = NativeMuted, fontSize = 10.sp)
                }
            }
        }
    }
}

@Composable
internal fun NativeComparisonBar(
    title: String,
    morningValue: BigDecimal,
    nightValue: BigDecimal,
    suffix: String,
) {
    val maximum = maxOf(morningValue, nightValue).toFloat().takeIf { it > 0 } ?: 1f
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, color = NativeForest, fontWeight = FontWeight.SemiBold)
            ComparisonRow("Morning", morningValue, maximum, suffix, NativeForest)
            ComparisonRow("Night", nightValue, maximum, suffix, Color(0xFF5A9B79))
        }
    }
}

@Composable
private fun ComparisonRow(
    label: String,
    amount: BigDecimal,
    maximum: Float,
    suffix: String,
    color: Color,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, color = NativeMuted, fontSize = 12.sp)
            Text("${amount.stripTrailingZeros().toPlainString()} $suffix", color = NativeForest, fontSize = 12.sp)
        }
        Canvas(modifier = Modifier.fillMaxWidth().height(8.dp)) {
            drawRoundRect(
                NativeLine,
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(size.height / 2),
            )
            drawRoundRect(
                color,
                size = androidx.compose.ui.geometry.Size(
                    size.width * (amount.toFloat() / maximum).coerceIn(0f, 1f),
                    size.height,
                ),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(size.height / 2),
            )
        }
    }
}

@Composable
internal fun NativePageHeader(
    title: String,
    subtitle: String,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, color = NativeForest, fontSize = 23.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = NativeMuted, fontSize = 12.sp)
        }
        trailing?.invoke()
    }
}
