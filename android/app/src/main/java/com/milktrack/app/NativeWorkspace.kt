package com.milktrack.app

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.milktrack.app.auth.CognitoAuthManager
import com.milktrack.app.data.NativeReceipt
import com.milktrack.app.data.NativeReceiptRepository
import com.milktrack.app.data.StoredNativeReceipt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

private enum class WorkspaceTab(val label: String) {
    Home("Home"),
    Receipts("Receipts"),
    Reports("Reports"),
    Excel("Excel"),
}

@Composable
internal fun NativeWorkspace(
    authManager: CognitoAuthManager,
    onSignOut: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember(context) { NativeReceiptRepository(context) }
    var selectedTab by remember { mutableStateOf(WorkspaceTab.Home) }
    var ownerId by remember { mutableStateOf("") }
    var token by remember { mutableStateOf("") }
    var email by remember { mutableStateOf<String?>(null) }
    var receipts by remember { mutableStateOf<List<StoredNativeReceipt>>(emptyList()) }
    var ready by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var syncMessage by remember { mutableStateOf<String?>(null) }
    var syncError by remember { mutableStateOf(false) }
    var pageError by remember { mutableStateOf<String?>(null) }
    var reviewSaveError by remember { mutableStateOf<String?>(null) }
    var selectedPhoto by remember { mutableStateOf<NativeReceiptPhoto?>(null) }
    var cameraPhoto by remember { mutableStateOf<NativeReceiptPhoto?>(null) }
    var showPhotoOptions by remember { mutableStateOf(false) }
    var showAccount by remember { mutableStateOf(false) }
    var showAssistant by remember { mutableStateOf(false) }
    var selectedReceipt by remember { mutableStateOf<StoredNativeReceipt?>(null) }
    var originalImage by remember { mutableStateOf<ImageBitmap?>(null) }
    var loadingOriginal by remember { mutableStateOf(false) }
    var originalError by remember { mutableStateOf<String?>(null) }

    suspend fun refresh() {
        loading = true
        pageError = null
        try {
            if (ownerId.isBlank()) ownerId = authManager.getCurrentUserId()
            if (token.isBlank()) token = authManager.getCurrentIdToken()
            receipts = repository.localReceipts(ownerId)
            val result = repository.refresh(ownerId, token)
            receipts = result.receipts
            syncMessage = result.message
            syncError = result.message != null
        } catch (error: Exception) {
            pageError = error.message ?: "MilkTrack could not load your verified receipts."
        } finally {
            loading = false
        }
    }

    fun refreshReceipts() {
        scope.launch { refresh() }
    }

    val galleryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent(),
    ) { uri ->
        if (uri != null) {
            val mimeType = normalizedImageMime(context.contentResolver.getType(uri))
            val filename = uri.lastPathSegment?.substringAfterLast('/')?.takeIf(String::isNotBlank)
                ?: "receipt.jpg"
            selectedPhoto = NativeReceiptPhoto(uri, filename, mimeType, "upload")
            pageError = null
            reviewSaveError = null
        }
    }
    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture(),
    ) { captured ->
        if (captured) {
            selectedPhoto = cameraPhoto
            pageError = null
            reviewSaveError = null
        } else if (cameraPhoto != null) {
            pageError = "No receipt photo was captured."
        }
        cameraPhoto = null
    }

    LaunchedEffect(authManager) {
        try {
            token = authManager.getCurrentIdToken()
            ownerId = authManager.getCurrentUserId()
            email = authManager.getCurrentEmail()
            receipts = repository.localReceipts(ownerId)
            refresh()
        } catch (error: Exception) {
            pageError = error.message ?: "Sign in again to access your MilkTrack data."
        } finally {
            ready = true
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
            cameraPhoto = NativeReceiptPhoto(uri, file.name, "image/jpeg", "camera")
            cameraLauncher.launch(uri)
        } catch (error: Exception) {
            pageError = error.message ?: "MilkTrack could not start the camera."
        }
    }

    fun saveReceipt(receipt: NativeReceipt, photo: NativeReceiptPhoto) {
        scope.launch {
            saving = true
            reviewSaveError = null
            pageError = null
            try {
                val currentToken = authManager.getCurrentIdToken()
                token = currentToken
                val photoBytes = withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(photo.uri)?.use { input ->
                        input.readBoundedBytes(10 * 1024 * 1024)
                    } ?: throw IllegalStateException("MilkTrack could not read the selected receipt photo.")
                }
                require(photoBytes.isNotEmpty() && photoBytes.size <= 10 * 1024 * 1024) {
                    "Receipt photos must be between 1 byte and 10 MB."
                }
                val result = repository.saveVerified(ownerId, currentToken, receipt, photoBytes)
                receipts = result.receipts
                syncMessage = result.message
                syncError = result.message?.startsWith("Verified receipt saved securely") == true
                selectedPhoto = null
                selectedTab = WorkspaceTab.Receipts
            } catch (error: Exception) {
                reviewSaveError = error.message ?: "The verified receipt could not be saved."
            } finally {
                saving = false
            }
        }
    }

    fun loadOriginal(stored: StoredNativeReceipt) {
        scope.launch {
            loadingOriginal = true
            originalImage = null
            originalError = null
            try {
                val currentToken = authManager.getCurrentIdToken()
                token = currentToken
                val file = repository.imageFor(ownerId, currentToken, stored.receipt.id)
                originalImage = withContext(Dispatchers.IO) { decodePhoto(file) }
            } catch (error: Exception) {
                originalError = error.message ?: "The original receipt photo could not be opened."
            } finally {
                loadingOriginal = false
            }
        }
    }

    Scaffold(
        containerColor = NativeBackground,
        topBar = {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("MilkTrack", color = NativeForest, fontWeight = FontWeight.Bold)
                    Text(selectedTab.label, color = NativeMuted, style = androidx.compose.material3.MaterialTheme.typography.labelSmall)
                }
                IconButton(onClick = { showAccount = true }) {
                    Icon(Icons.Default.AccountCircle, contentDescription = "Account", tint = NativeForest)
                }
            }
        },
        bottomBar = {
            NavigationBar(containerColor = androidx.compose.ui.graphics.Color.White) {
                NavigationBarItem(
                    selected = selectedTab == WorkspaceTab.Home,
                    onClick = { selectedTab = WorkspaceTab.Home },
                    icon = { Icon(Icons.Default.Home, contentDescription = null) },
                    label = { Text("Home") },
                )
                NavigationBarItem(
                    selected = selectedTab == WorkspaceTab.Receipts,
                    onClick = { selectedTab = WorkspaceTab.Receipts },
                    icon = { Icon(Icons.AutoMirrored.Filled.ReceiptLong, contentDescription = null) },
                    label = { Text("Receipts") },
                )
                NavigationBarItem(
                    selected = selectedTab == WorkspaceTab.Reports,
                    onClick = { selectedTab = WorkspaceTab.Reports },
                    icon = { Icon(Icons.Default.Assessment, contentDescription = null) },
                    label = { Text("Reports") },
                )
                NavigationBarItem(
                    selected = selectedTab == WorkspaceTab.Excel,
                    onClick = { selectedTab = WorkspaceTab.Excel },
                    icon = { Icon(Icons.Default.TableChart, contentDescription = null) },
                    label = { Text("Excel") },
                )
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            pageError?.let { NativeStatus(it, error = true) }
            if (!ready) {
                NativeLoading()
            } else {
                when (selectedTab) {
                    WorkspaceTab.Home -> NativeHomeScreen(
                        receipts = receipts,
                        loading = loading,
                        syncMessage = syncMessage,
                        isError = syncError,
                        onRefresh = ::refreshReceipts,
                        onCapture = ::capturePhoto,
                        onUpload = { galleryLauncher.launch("image/*") },
                        onOpenReceipts = { selectedTab = WorkspaceTab.Receipts },
                        onOpenAssistant = { showAssistant = true },
                        onReceiptClick = { stored ->
                            selectedReceipt = stored
                            originalImage = null
                            originalError = null
                        },
                    )
                    WorkspaceTab.Receipts -> NativeReceiptsScreen(
                        receipts = receipts,
                        loading = loading,
                        onAddReceipt = { showPhotoOptions = true },
                        onRefresh = ::refreshReceipts,
                        onReceiptClick = { stored ->
                            selectedReceipt = stored
                            originalImage = null
                            originalError = null
                        },
                    )
                    WorkspaceTab.Reports -> NativeReportsScreen(
                        receipts = receipts,
                        onReceiptClick = { stored ->
                            selectedReceipt = stored
                            originalImage = null
                            originalError = null
                        },
                    )
                    WorkspaceTab.Excel -> NativeExcelScreen(
                        receipts = receipts,
                        repository = repository,
                        ownerId = ownerId,
                        idToken = token,
                        onRecordsChanged = { receipts = it },
                    )
                }
            }
        }
    }

    if (showPhotoOptions) {
        AlertDialog(
            onDismissRequest = { showPhotoOptions = false },
            title = { Text("Add a receipt") },
            text = { Text("Take a photo or choose an image. MilkTrack checks its quality and lets you verify every value before saving.") },
            confirmButton = {
                Button(onClick = {
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
        NativeReceiptReviewDialog(
            photo = photo,
            saving = saving,
            saveError = reviewSaveError,
            onDismiss = { if (!saving) selectedPhoto = null },
            onVerifyAndSave = { receipt -> saveReceipt(receipt, photo) },
        )
    }

    selectedReceipt?.let { stored ->
        NativeReceiptDetailsDialog(
            stored = stored,
            loadingImage = loadingOriginal,
            image = originalImage,
            imageError = originalError,
            onLoadOriginal = { loadOriginal(stored) },
            onDismiss = {
                selectedReceipt = null
                originalImage = null
                originalError = null
            },
        )
    }

    if (showAccount) {
        AlertDialog(
            onDismissRequest = { showAccount = false },
            title = { Text("Account") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(email ?: "Signed in to MilkTrack", color = NativeForest, fontWeight = FontWeight.SemiBold)
                    Text("Your receipt records are stored in this account and synced securely when online.", color = NativeMuted)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    showAccount = false
                    onSignOut()
                }) { Text("Sign out") }
            },
            dismissButton = {
                TextButton(onClick = { showAccount = false }) { Text("Close") }
            },
        )
    }

    if (showAssistant) {
        NativeAssistantDialog(
            receipts = receipts.map(StoredNativeReceipt::receipt),
            authManager = authManager,
            onDismiss = { showAssistant = false },
        )
    }
}

private fun normalizedImageMime(mimeType: String?): String =
    when (mimeType?.lowercase()) {
        "image/jpg" -> "image/jpeg"
        null, "" -> "image/jpeg"
        else -> mimeType
    }

private fun java.io.InputStream.readBoundedBytes(maxBytes: Int): ByteArray {
    val output = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(8 * 1024)
    while (true) {
        val count = read(buffer)
        if (count < 0) break
        require(output.size() + count <= maxBytes) {
            "Receipt photos must be 10 MB or smaller."
        }
        output.write(buffer, 0, count)
    }
    return output.toByteArray()
}
