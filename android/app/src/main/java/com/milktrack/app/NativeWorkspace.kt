package com.milktrack.app

import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.milktrack.app.auth.CognitoAuthManager
import com.milktrack.app.data.AssistantMessage
import com.milktrack.app.data.NativeReceipt
import com.milktrack.app.data.NativeReceiptApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.math.BigDecimal
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.util.UUID

private val NativeForest = Color(0xFF153D2E)
private val NativeBackground = Color(0xFFF5F8F5)
private val NativeMuted = Color(0xFF58675F)
private val NativeMint = Color(0xFFD9F0E2)

private data class ReceiptPhoto(
    val uri: Uri,
    val name: String,
    val mimeType: String,
    val entryMethod: String,
)

private enum class WorkspaceTab(val label: String) {
    Dashboard("Home"),
    Receipts("Receipts"),
    Assistant("Assistant"),
}

@Composable
internal fun NativeWorkspace(
    authManager: CognitoAuthManager,
    onSignOut: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selectedTab by remember { mutableStateOf(WorkspaceTab.Dashboard) }
    var token by remember { mutableStateOf<String?>(null) }
    var receipts by remember { mutableStateOf<List<NativeReceipt>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var reviewSaveError by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var showPhotoOptions by remember { mutableStateOf(false) }
    var selectedPhoto by remember { mutableStateOf<ReceiptPhoto?>(null) }
    var cameraPhoto by remember { mutableStateOf<ReceiptPhoto?>(null) }

    fun refreshReceipts() {
        scope.launch {
            loading = true
            errorMessage = null
            try {
                val currentToken = token ?: authManager.getCurrentIdToken().also { token = it }
                receipts = NativeReceiptApi.listReceipts(currentToken)
            } catch (error: Exception) {
                errorMessage = error.message ?: "MilkTrack could not load your receipts."
            } finally {
                loading = false
            }
        }
    }

    val galleryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent(),
    ) { uri ->
        if (uri != null) {
            val mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"
            val name = uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() }
                ?: "receipt.jpg"
            selectedPhoto = ReceiptPhoto(uri, name, mimeType, "upload")
            errorMessage = null
        }
    }
    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture(),
    ) { captured ->
        if (captured) selectedPhoto = cameraPhoto
        cameraPhoto = null
    }

    LaunchedEffect(authManager) {
        try {
            token = authManager.getCurrentIdToken()
            refreshReceipts()
        } catch (error: Exception) {
            errorMessage = error.message ?: "Sign in again to access your MilkTrack data."
            loading = false
        }
    }

    fun capturePhoto() {
        try {
            val file = File(context.cacheDir, "receipt-captures/${UUID.randomUUID()}.jpg")
            file.parentFile?.mkdirs()
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file,
            )
            cameraPhoto = ReceiptPhoto(uri, file.name, "image/jpeg", "camera")
            cameraLauncher.launch(uri)
        } catch (error: Exception) {
            errorMessage = error.message ?: "MilkTrack could not start the camera."
        }
    }

    fun saveReceipt(receipt: NativeReceipt, photo: ReceiptPhoto) {
        scope.launch {
            saving = true
            errorMessage = null
            reviewSaveError = null
            try {
                val currentToken = token ?: authManager.getCurrentIdToken().also { token = it }
                val bytes = withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(photo.uri)?.use { it.readBytes() }
                        ?: throw IllegalStateException("MilkTrack could not read the selected photo.")
                }
                NativeReceiptApi.saveReceipt(
                    idToken = currentToken,
                    receipt = receipt,
                    imageBytes = bytes,
                    entryMethod = photo.entryMethod,
                )
                receipts = NativeReceiptApi.listReceipts(currentToken)
                selectedPhoto = null
                notice = "Receipt saved to your private MilkTrack account."
                selectedTab = WorkspaceTab.Receipts
            } catch (error: Exception) {
                errorMessage = error.message ?: "The receipt could not be saved."
                reviewSaveError = errorMessage
            } finally {
                saving = false
            }
        }
    }

    Scaffold(
        containerColor = NativeBackground,
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                WorkspaceTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = {
                            selectedTab = tab
                            notice = null
                        },
                        icon = {},
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .imePadding(),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("MilkTrack", color = NativeForest, fontSize = 21.sp, fontWeight = FontWeight.Bold)
                    Text("Your dairy dashboard", color = NativeMuted, fontSize = 12.sp)
                }
                TextButton(onClick = onSignOut) { Text("Sign out") }
            }
            errorMessage?.let { InlineStatus(it, isError = true) }
            notice?.let { InlineStatus(it, isError = false) }
            when (selectedTab) {
                WorkspaceTab.Dashboard -> DashboardScreen(
                    receipts = receipts,
                    loading = loading,
                    onOpenReceipts = { selectedTab = WorkspaceTab.Receipts },
                    onOpenAssistant = { selectedTab = WorkspaceTab.Assistant },
                    onRefresh = ::refreshReceipts,
                )
                WorkspaceTab.Receipts -> ReceiptsScreen(
                    receipts = receipts,
                    loading = loading,
                    onAddReceipt = { showPhotoOptions = true },
                    onRefresh = ::refreshReceipts,
                )
                WorkspaceTab.Assistant -> AssistantScreen(receipts = receipts, authManager = authManager)
            }
        }
    }

    if (showPhotoOptions) {
        AlertDialog(
            onDismissRequest = { showPhotoOptions = false },
            title = { Text("Add a receipt") },
            text = { Text("Take a photo or choose an image. You will review every value before it is saved.") },
            confirmButton = {
                TextButton(onClick = {
                    showPhotoOptions = false
                    capturePhoto()
                }) { Text("Take photo") }
            },
            dismissButton = {
                Row {
                    TextButton(onClick = {
                        showPhotoOptions = false
                        galleryLauncher.launch("image/*")
                    }) { Text("Choose photo") }
                    TextButton(onClick = { showPhotoOptions = false }) { Text("Cancel") }
                }
            },
        )
    }

    selectedPhoto?.let { photo ->
        ReceiptReviewDialog(
            photo = photo,
            saving = saving,
            saveError = reviewSaveError,
            onDismiss = { if (!saving) selectedPhoto = null },
            onSave = { receipt -> saveReceipt(receipt, photo) },
        )
    }
}

@Composable
private fun DashboardScreen(
    receipts: List<NativeReceipt>,
    loading: Boolean,
    onOpenReceipts: () -> Unit,
    onOpenAssistant: () -> Unit,
    onRefresh: () -> Unit,
) {
    val thisMonth = YearMonth.now().toString()
    val monthReceipts = receipts.filter { it.receiptDate.startsWith(thisMonth) }
    val litres = monthReceipts.sumOf { it.quantityLitres.toBigDecimalOrNull() ?: BigDecimal.ZERO }
    val earnings = monthReceipts.sumOf { it.totalAmount.toBigDecimalOrNull() ?: BigDecimal.ZERO }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            start = 20.dp, end = 20.dp, top = 12.dp, bottom = 24.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Dashboard", color = NativeForest, fontSize = 29.sp, fontWeight = FontWeight.Bold)
                Text("A clear view of your verified milk deliveries.", color = NativeMuted)
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MetricCard("This month", "₹${earnings.setScale(2, java.math.RoundingMode.HALF_UP)}", "${monthReceipts.size} receipts", Modifier.weight(1f))
                MetricCard("Milk delivered", "${litres.setScale(2, java.math.RoundingMode.HALF_UP)} L", "This month", Modifier.weight(1f))
            }
        }
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.cardColors(containerColor = NativeForest),
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text("Your records, your control", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text(
                        "Review each receipt before it is saved. The assistant uses verified totals only.",
                        color = Color(0xFFE0EEE5),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = onOpenReceipts) { Text("View receipts") }
                        OutlinedButton(onClick = onOpenAssistant) { Text("Ask assistant") }
                    }
                }
            }
        }
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Recent receipts", color = NativeForest, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                TextButton(onClick = onRefresh) { Text("Refresh") }
            }
        }
        if (loading) {
            item { LoadingRow() }
        } else if (receipts.isEmpty()) {
            item { EmptyCard("No receipts yet", "Add your first receipt to see your delivery history and totals here.") }
        } else {
            items(receipts.take(3), key = { it.id }) { receipt -> ReceiptCard(receipt) }
        }
    }
}

@Composable
private fun ReceiptsScreen(
    receipts: List<NativeReceipt>,
    loading: Boolean,
    onAddReceipt: () -> Unit,
    onRefresh: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text("Receipts", color = NativeForest, fontSize = 27.sp, fontWeight = FontWeight.Bold)
                Text("${receipts.size} saved records", color = NativeMuted)
            }
            Button(onClick = onAddReceipt) { Text("Add receipt") }
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
            horizontalArrangement = Arrangement.End,
        ) {
            TextButton(onClick = onRefresh) { Text("Refresh") }
        }
        when {
            loading -> LoadingRow()
            receipts.isEmpty() -> EmptyCard(
                "Your history starts here",
                "Capture or choose a receipt photo, then confirm the details before syncing.",
            )
            else -> LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 22.dp),
            ) {
                items(receipts, key = { it.id }) { receipt -> ReceiptCard(receipt) }
            }
        }
    }
}

@Composable
private fun AssistantScreen(
    receipts: List<NativeReceipt>,
    authManager: CognitoAuthManager,
) {
    val messages = remember {
        mutableStateListOf(AssistantMessage("assistant", "Hello! I can help you understand your verified delivery totals."))
    }
    var question by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(modifier = Modifier.padding(top = 6.dp)) {
            Text("AI assistant", color = NativeForest, fontSize = 27.sp, fontWeight = FontWeight.Bold)
            Text("Answers use verified totals only. Receipt images and individual records are not sent.", color = NativeMuted, fontSize = 13.sp)
        }
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(9.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp),
        ) {
            items(messages) { message -> ChatBubble(message) }
            if (sending) item { LoadingRow() }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextField(
                value = question,
                onValueChange = { question = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Ask about your deliveries") },
                enabled = !sending,
                maxLines = 3,
            )
            Button(
                enabled = !sending && question.isNotBlank(),
                onClick = {
                    val prompt = question.trim()
                    val history = messages.drop(1).takeLast(6)
                    question = ""
                    error = null
                    messages.add(AssistantMessage("user", prompt))
                    sending = true
                    scope.launch {
                        try {
                            val idToken = authManager.getCurrentIdToken()
                            val answer = NativeReceiptApi.askAssistant(idToken, prompt, history, receipts)
                            messages.add(AssistantMessage("assistant", answer))
                        } catch (failure: Exception) {
                            error = failure.message ?: "The assistant could not answer right now."
                            messages.removeAt(messages.lastIndex)
                        } finally {
                            sending = false
                        }
                    }
                },
            ) { Text("Send") }
        }
    }
}

@Composable
private fun ReceiptReviewDialog(
    photo: ReceiptPhoto,
    saving: Boolean,
    saveError: String?,
    onDismiss: () -> Unit,
    onSave: (NativeReceipt) -> Unit,
) {
    val context = LocalContext.current
    val previewResult by produceState<Result<ImageBitmap>?>(null, photo.uri) {
        value = runCatching {
            withContext(Dispatchers.IO) { decodeReceiptPreview(context, photo.uri) }
        }
    }
    var receiptDate by remember { mutableStateOf(LocalDate.now().toString()) }
    var receiptTime by remember { mutableStateOf(LocalTime.now().withSecond(0).withNano(0).toString()) }
    var litres by remember { mutableStateOf("") }
    var fat by remember { mutableStateOf("") }
    var snf by remember { mutableStateOf("") }
    var clr by remember { mutableStateOf("") }
    var rate by remember { mutableStateOf("") }
    var total by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Review receipt") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 540.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("Photo: ${photo.name}", color = NativeMuted, fontSize = 12.sp)
                Text("Enter the values shown on your receipt. Nothing is saved until you confirm.", color = NativeMuted, fontSize = 13.sp)
                when {
                    previewResult == null -> Text("Preparing photo preview…", color = NativeMuted, fontSize = 12.sp)
                    previewResult?.isSuccess == true -> Image(
                        bitmap = requireNotNull(previewResult).getOrThrow(),
                        contentDescription = "Selected receipt photo",
                        modifier = Modifier.fillMaxWidth().height(170.dp),
                        contentScale = ContentScale.Crop,
                    )
                    else -> Text(
                        "Photo preview unavailable: ${previewResult?.exceptionOrNull()?.message ?: "unknown image format"}",
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 12.sp,
                    )
                }
                ReviewField("Date (YYYY-MM-DD)", receiptDate) { receiptDate = it }
                ReviewField("Time (HH:MM)", receiptTime) { receiptTime = it }
                ReviewField("Quantity (litres)", litres) { litres = it }
                ReviewField("Fat", fat) { fat = it }
                ReviewField("SNF", snf) { snf = it }
                ReviewField("CLR", clr) { clr = it }
                ReviewField("Rate per litre (INR)", rate) { rate = it }
                ReviewField("Total amount (INR)", total) { total = it }
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
                saveError?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !saving,
                onClick = {
                    try {
                        val date = LocalDate.parse(receiptDate)
                        val time = LocalTime.parse(receiptTime)
                        val quantity = validDecimal(litres, "Quantity", 3)
                        val fatValue = validDecimal(fat, "Fat", 2)
                        val snfValue = validDecimal(snf, "SNF", 2)
                        val clrValue = validDecimal(clr, "CLR", 2)
                        val rateValue = validDecimal(rate, "Rate", 2)
                        val totalValue = validDecimal(total, "Total", 2)
                        onSave(
                            NativeReceipt(
                                id = UUID.randomUUID().toString(),
                                receiptDate = date.toString(),
                                receiptTime = time.toString().take(5),
                                shift = if (time.hour in 6..17) "Morning/Day" else "Night",
                                quantityLitres = quantity,
                                fat = fatValue,
                                snf = snfValue,
                                clr = clrValue,
                                ratePerLitre = rateValue,
                                totalAmount = totalValue,
                                originalFilename = photo.name.take(255),
                                originalMimeType = photo.mimeType,
                            ),
                        )
                    } catch (error: Exception) {
                        validationError = error.message ?: "Check the receipt values and try again."
                    }
                },
            ) { Text(if (saving) "Saving…" else "Confirm and save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancel") }
        },
    )
}

private fun decodeReceiptPreview(context: android.content.Context, uri: Uri): ImageBitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use {
        BitmapFactory.decodeStream(it, null, bounds)
    } ?: throw IllegalStateException("The selected receipt photo could not be opened.")
    require(bounds.outWidth > 0 && bounds.outHeight > 0) { "The selected file is not a readable image." }

    var sampleSize = 1
    while (bounds.outWidth / sampleSize > 1200 || bounds.outHeight / sampleSize > 1600) {
        sampleSize *= 2
    }
    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
    val bitmap = context.contentResolver.openInputStream(uri)?.use {
        BitmapFactory.decodeStream(it, null, options)
    } ?: throw IllegalStateException("The selected receipt photo could not be decoded.")
    return bitmap.asImageBitmap()
}

@Composable
private fun ReviewField(label: String, value: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.fillMaxWidth(),
        label = { Text(label) },
        singleLine = true,
    )
}

private fun validDecimal(value: String, label: String, scale: Int): String {
    val normalized = value.trim()
    val decimal = normalized.toBigDecimalOrNull()
        ?: throw IllegalArgumentException("$label must be a valid number.")
    val canonical = decimal.stripTrailingZeros().toPlainString()
    require(
        decimal > BigDecimal.ZERO &&
            Regex("^\\d{1,8}(?:\\.\\d{1,$scale})?$").matches(canonical),
    ) {
        "$label must be greater than zero with at most $scale decimal places."
    }
    return canonical
}

@Composable
private fun MetricCard(title: String, value: String, caption: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(modifier = Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(title, color = NativeMuted, fontSize = 12.sp)
            Text(value, color = NativeForest, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(caption, color = NativeMuted, fontSize = 12.sp)
        }
    }
}

@Composable
private fun ReceiptCard(receipt: NativeReceipt) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(receipt.receiptDate, color = NativeForest, fontWeight = FontWeight.SemiBold)
                Text("₹${receipt.totalAmount}", color = NativeForest, fontWeight = FontWeight.Bold)
            }
            Text(
                "${receipt.receiptTime} · ${receipt.shift} · ${receipt.quantityLitres} L",
                color = NativeMuted,
                fontSize = 13.sp,
            )
            Text(
                "Fat ${receipt.fat}% · SNF ${receipt.snf}% · ${receipt.originalFilename}",
                color = NativeMuted,
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun ChatBubble(message: AssistantMessage) {
    val isUser = message.role == "user"
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.88f),
            color = if (isUser) NativeForest else Color.White,
            shape = RoundedCornerShape(16.dp),
        ) {
            Text(
                message.content,
                modifier = Modifier.padding(13.dp),
                color = if (isUser) Color.White else NativeForest,
                lineHeight = 20.sp,
                fontSize = 14.sp,
            )
        }
    }
}

@Composable
private fun EmptyCard(title: String, message: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text(title, color = NativeForest, fontWeight = FontWeight.Bold)
            Text(message, color = NativeMuted, fontSize = 14.sp)
        }
    }
}

@Composable
private fun LoadingRow() {
    Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(modifier = Modifier.size(28.dp), strokeWidth = 3.dp)
    }
}

@Composable
private fun InlineStatus(message: String, isError: Boolean) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        color = if (isError) Color(0xFFFFECE8) else NativeMint,
        shape = RoundedCornerShape(12.dp),
    ) {
        Text(
            message,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
            color = if (isError) Color(0xFF8A281B) else NativeForest,
            fontSize = 12.sp,
        )
    }
}
