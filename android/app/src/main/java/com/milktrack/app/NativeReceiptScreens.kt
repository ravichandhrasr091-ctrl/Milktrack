package com.milktrack.app

import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.milktrack.app.data.NativeOcrResult
import com.milktrack.app.data.NativeOcrService
import com.milktrack.app.data.NativeReceipt
import com.milktrack.app.data.NativeReceiptAnalysis
import com.milktrack.app.data.NativeReceiptDraft
import com.milktrack.app.data.StoredNativeReceipt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

internal data class NativeReceiptPhoto(
    val uri: Uri,
    val filename: String,
    val mimeType: String,
    val entryMethod: String,
)

@Composable
internal fun NativeReceiptsScreen(
    receipts: List<StoredNativeReceipt>,
    loading: Boolean,
    onAddReceipt: () -> Unit,
    onRefresh: () -> Unit,
    onReceiptClick: (StoredNativeReceipt) -> Unit,
) {
    var search by remember { mutableStateOf("") }
    var shift by remember { mutableStateOf<String?>(null) }
    var fromDate by remember { mutableStateOf("") }
    var toDate by remember { mutableStateOf("") }
    val parsedFrom = runCatching { LocalDate.parse(fromDate) }.getOrNull()
    val parsedTo = runCatching { LocalDate.parse(toDate) }.getOrNull()
    val filtered = receipts.filter { stored ->
        val receipt = stored.receipt
        val queryMatches = search.isBlank() || listOf(
            receipt.receiptDate,
            receipt.receiptTime,
            receipt.shift,
            receipt.quantityLitres,
            receipt.totalAmount,
            receipt.originalFilename,
        ).any { it.contains(search.trim(), ignoreCase = true) }
        val date = runCatching { LocalDate.parse(receipt.receiptDate) }.getOrNull()
        val dateMatches = date != null &&
            (fromDate.isBlank() || parsedFrom?.let { !date.isBefore(it) } == true) &&
            (toDate.isBlank() || parsedTo?.let { !date.isAfter(it) } == true)
        queryMatches && dateMatches && (shift == null || receipt.shift == shift)
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        NativePageHeader(
            title = "Receipts",
            subtitle = "${receipts.size} verified records",
            trailing = { Button(onClick = onAddReceipt) { Text("Add receipt") } },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                modifier = Modifier.weight(1f),
                singleLine = true,
                label = { Text("Search receipts") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            )
            IconButton(onClick = onRefresh, enabled = !loading) {
                if (loading) CircularProgressIndicator(modifier = Modifier.size(20.dp))
                else Icon(Icons.Default.CalendarMonth, contentDescription = "Refresh receipt list")
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = shift == null, onClick = { shift = null }, label = { Text("All shifts") })
            FilterChip(selected = shift == "Morning/Day", onClick = {
                shift = if (shift == "Morning/Day") null else "Morning/Day"
            }, label = { Text("Morning") })
            FilterChip(selected = shift == "Night", onClick = {
                shift = if (shift == "Night") null else "Night"
            }, label = { Text("Night") })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = fromDate,
                onValueChange = { fromDate = it },
                modifier = Modifier.weight(1f),
                singleLine = true,
                label = { Text("From (YYYY-MM-DD)") },
                isError = fromDate.isNotBlank() && parsedFrom == null,
            )
            OutlinedTextField(
                value = toDate,
                onValueChange = { toDate = it },
                modifier = Modifier.weight(1f),
                singleLine = true,
                label = { Text("To (YYYY-MM-DD)") },
                isError = toDate.isNotBlank() && parsedTo == null,
            )
        }
        when {
            loading && receipts.isEmpty() -> NativeLoading()
            filtered.isEmpty() -> NativeEmptyState(
                if (receipts.isEmpty()) "No verified receipts yet" else "No matching receipts",
                if (receipts.isEmpty()) {
                    "Capture or upload a Dodla Cow receipt. Verify the extracted details before saving."
                } else {
                    "Try a different search, date range, or shift."
                },
            )
            else -> {
                val groups = filtered.groupBy { it.receipt.receiptDate.take(7) }
                    .toSortedMap(compareByDescending { it })
                LazyColumn(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(bottom = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    groups.forEach { (yearMonth, monthReceipts) ->
                        item(key = "month-$yearMonth") {
                            Text(
                                yearMonth,
                                modifier = Modifier.padding(top = 8.dp, bottom = 2.dp),
                                color = NativeForest,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                        items(monthReceipts, key = { it.receipt.id }) { stored ->
                            NativeReceiptCard(stored) { onReceiptClick(stored) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun NativeReceiptCard(
    stored: StoredNativeReceipt,
    onClick: () -> Unit,
) {
    val receipt = stored.receipt
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color.White),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(receipt.receiptDate, color = NativeForest, fontWeight = FontWeight.SemiBold)
                Text("₹${receipt.totalAmount}", color = NativeForest, fontWeight = FontWeight.Bold)
            }
            Text(
                "${receipt.receiptTime} · ${if (receipt.shift == "Morning/Day") "Morning" else "Night"} · ${receipt.quantityLitres} L",
                color = NativeMuted,
                fontSize = 13.sp,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("FAT ${receipt.fat} · SNF ${receipt.snf} · CLR ${receipt.clr}", color = NativeMuted, fontSize = 11.sp)
                Text(
                    when (stored.syncStatus) {
                        "synced" -> "Synced"
                        "pending" -> "Sync pending"
                        else -> "On this device"
                    },
                    color = if (stored.syncStatus == "synced") NativeForest else NativeMuted,
                    fontSize = 10.sp,
                )
            }
        }
    }
}

@Composable
internal fun NativeReceiptReviewDialog(
    photo: NativeReceiptPhoto,
    saving: Boolean,
    saveError: String?,
    onDismiss: () -> Unit,
    onVerifyAndSave: (NativeReceipt) -> Unit,
) {
    val context = LocalContext.current
    var ocr by remember(photo.uri) { mutableStateOf<NativeOcrResult?>(null) }
    var ocrFailure by remember(photo.uri) { mutableStateOf<String?>(null) }
    var draft by remember(photo.uri) { mutableStateOf(NativeReceiptDraft()) }
    var validationError by remember(photo.uri) { mutableStateOf<String?>(null) }

    LaunchedEffect(photo.uri, photo.mimeType) {
        ocr = null
        ocrFailure = null
        try {
            ocr = NativeOcrService.analyze(context, photo.uri, photo.mimeType)
            if (ocr?.analysis?.recognized == true) {
                draft = ocr?.analysis?.draft ?: NativeReceiptDraft()
            }
        } catch (error: Exception) {
            ocrFailure = error.message ?: "MilkTrack could not inspect this photo."
        }
    }
    val preview by produceState<Result<ImageBitmap>?>(null, photo.uri) {
        value = runCatching {
            withContext(Dispatchers.IO) { decodePhoto(context, photo.uri) }
        }
    }

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text("Review receipt") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 570.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                when {
                    preview == null -> Text("Preparing original photo…", color = NativeMuted, fontSize = 12.sp)
                    preview?.isSuccess == true -> Image(
                        bitmap = requireNotNull(preview).getOrThrow(),
                        contentDescription = "Original receipt photo for review",
                        modifier = Modifier.fillMaxWidth().height(170.dp),
                        contentScale = ContentScale.Fit,
                    )
                    else -> NativeStatus("Photo preview unavailable.", error = true)
                }
                when {
                    ocr == null && ocrFailure == null -> Row(
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        Text("Checking image quality and reading the receipt…", color = NativeMuted, fontSize = 12.sp)
                    }
                    ocrFailure != null -> NativeStatus(ocrFailure.orEmpty(), error = true)
                    ocr?.analysis?.recognized == false -> NativeStatus(
                        ocr?.analysis?.rejectionReason ?: "Receipt format not recognized.",
                        error = true,
                    )
                    else -> {
                        Text(
                            "Dodla Cow receipt recognized. Compare every value with the printed receipt and correct any mismatch.",
                            color = NativeForest,
                            fontSize = 12.sp,
                        )
                        Text("Numbers are not auto-corrected. Missing or unclear values must be entered from the receipt.", color = NativeMuted, fontSize = 11.sp)
                        ReceiptDraftField("Milk type", draft.milkType, KeyboardType.Text) {
                            draft = draft.copy(milkType = it)
                        }
                        ReceiptDraftField("Date (YYYY-MM-DD)", draft.receiptDate, KeyboardType.Text) {
                            draft = draft.copy(receiptDate = it)
                        }
                        ReceiptDraftField("Time (HH:MM)", draft.receiptTime, KeyboardType.Text) {
                            val shift = runCatching { LocalTime.parse(it).let { time ->
                                if (time.hour in 6..17) "Morning/Day" else "Night"
                            } }.getOrDefault(draft.shift)
                            draft = draft.copy(receiptTime = it, shift = shift)
                        }
                        Text("Shift: ${if (draft.shift == "Morning/Day") "Morning" else draft.shift.ifBlank { "Check receipt time" }}", color = NativeMuted, fontSize = 12.sp)
                        ReceiptDraftField("Quantity (litres)", draft.quantityLitres) { draft = draft.copy(quantityLitres = it) }
                        ReceiptDraftField("FAT", draft.fat) { draft = draft.copy(fat = it) }
                        ReceiptDraftField("SNF", draft.snf) { draft = draft.copy(snf = it) }
                        ReceiptDraftField("CLR", draft.clr) { draft = draft.copy(clr = it) }
                        ReceiptDraftField("Rate per litre (INR)", draft.ratePerLitre) { draft = draft.copy(ratePerLitre = it) }
                        ReceiptDraftField("Total amount (INR)", draft.totalAmount) { draft = draft.copy(totalAmount = it) }
                        if (draft.mccCode.isNotBlank()) Text("MCC: ${draft.mccCode}", color = NativeMuted, fontSize = 11.sp)
                        if (draft.vlccCode.isNotBlank()) Text("VLCC: ${draft.vlccCode}", color = NativeMuted, fontSize = 11.sp)
                    }
                }
                validationError?.let { NativeStatus(it, error = true) }
                saveError?.let { NativeStatus(it, error = true) }
            }
        },
        confirmButton = {
            Button(
                enabled = !saving && ocr?.analysis?.recognized == true,
                onClick = {
                    try {
                        val receipt = validateDraft(draft, photo, ocr?.analysis)
                        onVerifyAndSave(receipt)
                    } catch (error: Exception) {
                        validationError = error.message ?: "Check the receipt values and try again."
                    }
                },
            ) {
                if (saving) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                else {
                    Icon(Icons.Default.CheckCircle, contentDescription = null)
                    Text(" Verify & Save")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancel") }
        },
    )
}

@Composable
private fun ReceiptDraftField(
    label: String,
    value: String,
    keyboardType: KeyboardType = KeyboardType.Decimal,
    onValueChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.fillMaxWidth(),
        label = { Text(label) },
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = keyboardType),
        singleLine = true,
    )
}

private fun validateDraft(
    draft: NativeReceiptDraft,
    photo: NativeReceiptPhoto,
    analysis: NativeReceiptAnalysis?,
): NativeReceipt {
    require(analysis?.recognized == true) { "Only a recognized Dodla Cow receipt can be verified." }
    val date = LocalDate.parse(draft.receiptDate)
    require(date.toString() == draft.receiptDate) { "Check the receipt date." }
    val time = LocalTime.parse(draft.receiptTime)
    require(draft.receiptTime.matches(Regex("""([01]\d|2[0-3]):[0-5]\d"""))) {
        "Enter the printed receipt time in HH:MM format."
    }
    val expectedShift = if (time.hour in 6..17) "Morning/Day" else "Night"
    require(draft.shift == expectedShift) { "Receipt shift must match the receipt time." }
    require(draft.milkType.equals("Cow", ignoreCase = true)) { "Verify that the printed milk type is Cow." }
    val values = listOf(
        "Quantity" to draft.quantityLitres,
        "FAT" to draft.fat,
        "SNF" to draft.snf,
        "CLR" to draft.clr,
        "Rate" to draft.ratePerLitre,
        "Amount" to draft.totalAmount,
    )
    values.forEach { (label, value) ->
        require(value.matches(Regex("""\d{1,8}(?:\.\d{1,4})?""")) &&
            (value.toBigDecimalOrNull()?.compareTo(BigDecimal.ZERO) ?: 0) > 0) {
            "Enter $label exactly as printed, using a decimal point if needed."
        }
    }
    return NativeReceipt(
        id = UUID.randomUUID().toString(),
        receiptDate = date.toString(),
        receiptTime = draft.receiptTime,
        shift = expectedShift,
        quantityLitres = draft.quantityLitres,
        fat = draft.fat,
        snf = draft.snf,
        clr = draft.clr,
        ratePerLitre = draft.ratePerLitre,
        totalAmount = draft.totalAmount,
        originalFilename = photo.filename.take(255),
        originalMimeType = photo.mimeType,
        entryMethod = photo.entryMethod,
        ocrRawText = analysis.rawText,
        supplierCode = draft.supplierCode.takeIf(String::isNotBlank),
        mccCode = draft.mccCode.takeIf(String::isNotBlank),
        vlccCode = draft.vlccCode.takeIf(String::isNotBlank),
        verificationTimestamp = java.time.Instant.now().toString(),
    )
}

@Composable
internal fun NativeReceiptDetailsDialog(
    stored: StoredNativeReceipt,
    loadingImage: Boolean,
    image: ImageBitmap?,
    imageError: String?,
    onLoadOriginal: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Verified receipt") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 560.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                Text("${stored.receipt.receiptDate} · ${stored.receipt.receiptTime}", color = NativeForest, fontWeight = FontWeight.SemiBold)
                DetailRow("Shift", if (stored.receipt.shift == "Morning/Day") "Morning" else stored.receipt.shift)
                DetailRow("Quantity", "${stored.receipt.quantityLitres} L")
                DetailRow("Total amount", "₹${stored.receipt.totalAmount}")
                DetailRow("FAT · SNF · CLR", "${stored.receipt.fat} · ${stored.receipt.snf} · ${stored.receipt.clr}")
                DetailRow("Rate", "₹${stored.receipt.ratePerLitre}/L")
                DetailRow("Receipt photo", stored.receipt.originalFilename)
                DetailRow("Cloud status", stored.syncStatus)
                if (image != null) {
                    Image(
                        bitmap = image,
                        contentDescription = "Original approved receipt photo",
                        modifier = Modifier.fillMaxWidth().height(250.dp),
                        contentScale = ContentScale.Fit,
                    )
                } else if (loadingImage) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp))
                        Text("Loading original photo…", color = NativeMuted, fontSize = 12.sp)
                    }
                } else {
                    imageError?.let { NativeStatus(it, error = true) }
                    OutlinedButton(onClick = onLoadOriginal) { Text("View original photo") }
                }
                Text("Saved only after you verified the printed receipt.", color = NativeMuted, fontSize = 11.sp)
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
    )
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = NativeMuted, fontSize = 12.sp)
        Text(value, color = NativeForest, fontWeight = FontWeight.Medium, fontSize = 12.sp)
    }
}

private fun decodePhoto(context: android.content.Context, uri: Uri): ImageBitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        ?: throw IllegalStateException("Photo preview could not be opened.")
    require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Selected file is not a readable image." }
    return decodeBitmap(bounds.outWidth, bounds.outHeight) {
        val options = BitmapFactory.Options().apply { inSampleSize = it }
        context.contentResolver.openInputStream(uri)?.use { stream ->
            BitmapFactory.decodeStream(stream, null, options)
        }
    }
}

internal fun decodePhoto(file: File): ImageBitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Stored receipt photo is not readable." }
    return decodeBitmap(bounds.outWidth, bounds.outHeight) { sample ->
        BitmapFactory.decodeFile(
            file.absolutePath,
            BitmapFactory.Options().apply { inSampleSize = sample },
        )
    }
}

private fun decodeBitmap(
    width: Int,
    height: Int,
    decode: (Int) -> android.graphics.Bitmap?,
): ImageBitmap {
    var sample = 1
    while (width / sample > 1200 || height / sample > 1600) sample *= 2
    return decode(sample)?.asImageBitmap()
        ?: throw IllegalStateException("The selected receipt photo could not be decoded.")
}
