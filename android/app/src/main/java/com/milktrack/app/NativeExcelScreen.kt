package com.milktrack.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.ui.graphics.Color
import com.milktrack.app.data.NativeAnalytics
import com.milktrack.app.data.NativeBackup
import com.milktrack.app.data.NativeReceiptRepository
import com.milktrack.app.data.NativeWorkbook
import com.milktrack.app.data.ReportPeriod
import com.milktrack.app.data.StoredNativeReceipt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate

private const val XLSX_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

@Composable
internal fun NativeExcelScreen(
    receipts: List<StoredNativeReceipt>,
    repository: NativeReceiptRepository,
    ownerId: String,
    idToken: String,
    onRecordsChanged: (List<StoredNativeReceipt>) -> Unit,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    val today = LocalDate.now()
    var selectedSheet by remember { mutableStateOf("All Records") }
    var selectedPeriod by remember { mutableStateOf(ReportPeriod.SevenDays) }
    var startText by remember { mutableStateOf(NativeAnalytics.defaultStart(today, ReportPeriod.SevenDays).toString()) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var messageError by remember { mutableStateOf(false) }
    var exportMode by remember { mutableStateOf<ExportMode?>(null) }
    var backupPassword by remember { mutableStateOf("") }
    var showBackupDialog by remember { mutableStateOf(false) }
    val start = runCatching { LocalDate.parse(startText) }.getOrNull()
    val periodRange = start?.let { NativeAnalytics.range(it, selectedPeriod) }
    val sheets = NativeWorkbook.masterSheets(
        receipts.map(StoredNativeReceipt::receipt),
        today,
        if (exportMode == ExportMode.Period) periodRange else null,
    )
    val currentSheet = sheets.firstOrNull { it.name == selectedSheet } ?: sheets.first()

    val workbookLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument(XLSX_MIME),
    ) { uri ->
        if (uri != null) {
            val mode = exportMode ?: ExportMode.Master
            scope.launch {
                busy = true
                message = null
                try {
                    val workbook = withContext(Dispatchers.Default) {
                        if (mode == ExportMode.Master) {
                            NativeWorkbook.master(receipts.map(StoredNativeReceipt::receipt), today)
                        } else {
                            val range = requireNotNull(periodRange) { "Select a valid report start date first." }
                            NativeWorkbook.selectedPeriod(receipts.map(StoredNativeReceipt::receipt), range, today)
                        }
                    }
                    withContext(Dispatchers.IO) {
                        context.contentResolver.openOutputStream(uri)?.use { it.write(workbook) }
                            ?: throw IllegalStateException("MilkTrack could not write the Excel workbook.")
                    }
                    message = "Workbook exported successfully."
                    messageError = false
                } catch (error: Exception) {
                    message = error.message ?: "The workbook could not be exported."
                    messageError = true
                } finally {
                    busy = false
                    exportMode = null
                }
            }
        } else {
            exportMode = null
        }
    }

    val backupLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream"),
    ) { uri ->
        val password = backupPassword
        backupPassword = ""
        if (uri != null) {
            scope.launch {
                busy = true
                message = null
                try {
                    val rows = repository.backupRows(ownerId)
                    val images = withContext(Dispatchers.IO) {
                        val result = mutableMapOf<String, ByteArray>()
                        for (row in rows) {
                            val file = repository.imageFor(ownerId, idToken, row.receipt.id)
                            val bytes = file.readBytes()
                            require(bytes.isNotEmpty() && bytes.size <= 10 * 1024 * 1024) {
                                "A receipt photo is empty or larger than 10 MB."
                            }
                            result[row.receipt.id] = bytes
                        }
                        result
                    }
                    withContext(Dispatchers.IO) {
                        val output = context.contentResolver.openOutputStream(uri)
                            ?: throw IllegalStateException("MilkTrack could not create the backup file.")
                        NativeBackup.write(output, rows, images, password.toCharArray())
                    }
                    message = "Encrypted backup created with ${rows.size} verified receipts."
                    messageError = false
                } catch (error: Exception) {
                    message = error.message ?: "The encrypted backup could not be created."
                    messageError = true
                } finally {
                    busy = false
                }
            }
        }
    }

    val restorePasswordLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        val password = backupPassword
        backupPassword = ""
        if (uri != null) {
            scope.launch {
                busy = true
                message = null
                try {
                    val backup = withContext(Dispatchers.IO) {
                        context.contentResolver.openInputStream(uri)?.use {
                            NativeBackup.read(it, password.toCharArray())
                        } ?: throw IllegalStateException("MilkTrack could not open this backup.")
                    }
                    var restored = 0
                    backup.receipts.forEach { receipt ->
                        if (repository.restoreReceipt(ownerId, receipt.receipt, receipt.imageBytes)) restored++
                    }
                    onRecordsChanged(repository.localReceipts(ownerId))
                    message = "Restored $restored verified receipts. Existing receipt IDs were left unchanged."
                    messageError = false
                } catch (error: Exception) {
                    message = error.message ?: "The backup could not be restored."
                    messageError = true
                } finally {
                    busy = false
                }
            }
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        NativePageHeader(
            title = "Excel & backup",
            subtitle = "Verified receipts only",
        )
        message?.let { NativeStatus(it, error = messageError) }
        if (busy) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.padding(4.dp), strokeWidth = 2.dp)
                Text("Preparing your file…", color = NativeMuted, fontSize = 12.sp)
            }
        }
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                NativeMetricCard(
                    "Master workbook",
                    "Dodla_Milk_Collection_Master.xlsx",
                    "${receipts.size} verified receipts · 6 worksheets",
                    Modifier.fillMaxWidth(),
                )
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                            onClick = {
                                exportMode = ExportMode.Master
                                workbookLauncher.launch("Dodla_Milk_Collection_Master.xlsx")
                            },
                        ) { Text("Download master") }
                        OutlinedButton(
                            modifier = Modifier.weight(1f),
                            enabled = !busy && periodRange != null,
                            onClick = {
                                exportMode = ExportMode.Period
                                workbookLauncher.launch("Dodla_Milk_Collection_${selectedPeriod.name}.xlsx")
                            },
                        ) { Text("Export period") }
                    }
                    Text("Period export", color = NativeForest, fontWeight = FontWeight.SemiBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        listOf(
                            ReportPeriod.SevenDays,
                            ReportPeriod.FifteenDays,
                            ReportPeriod.OneMonth,
                            ReportPeriod.OneYear,
                        ).forEach { option ->
                            FilterChip(
                                selected = selectedPeriod == option,
                                onClick = {
                                    selectedPeriod = option
                                    startText = NativeAnalytics.defaultStart(today, option).toString()
                                },
                                label = { Text(option.label, fontSize = 10.sp) },
                            )
                        }
                    }
                    OutlinedTextField(
                        value = startText,
                        onValueChange = { startText = it },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        label = { Text("Start date (YYYY-MM-DD)") },
                        isError = periodRange == null,
                    )
                }
            }
            item {
                Text("Workbook preview", color = NativeForest, fontWeight = FontWeight.Bold)
            }
            item {
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    sheets.forEach { sheet ->
                        FilterChip(
                            selected = selectedSheet == sheet.name,
                            onClick = { selectedSheet = sheet.name },
                            label = { Text(sheet.name, fontSize = 9.sp) },
                        )
                    }
                }
            }
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().heightIn(max = 300.dp)
                            .verticalScroll(rememberScrollState()).padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(7.dp),
                    ) {
                        Text(currentSheet.name, color = NativeForest, fontWeight = FontWeight.Bold)
                        WorkbookPreviewRow(currentSheet.headers, header = true)
                        currentSheet.rows.take(8).forEach { row -> WorkbookPreviewRow(row) }
                        if (currentSheet.rows.isEmpty()) {
                            Text("No verified rows in this worksheet.", color = NativeMuted, fontSize = 12.sp)
                        } else if (currentSheet.rows.size > 8) {
                            Text("Showing 8 of ${currentSheet.rows.size} rows.", color = NativeMuted, fontSize = 10.sp)
                        }
                    }
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("Encrypted backup", color = NativeForest, fontWeight = FontWeight.Bold)
                    Text(
                        "A password-protected backup contains verified receipts and original photos. Keep the password safe; it cannot be recovered.",
                        color = NativeMuted,
                        fontSize = 12.sp,
                    )
                    OutlinedButton(
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { exportMode = ExportMode.Backup; showBackupDialog = true },
                    ) { Text("Create encrypted backup") }
                    OutlinedButton(
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { exportMode = ExportMode.Restore; showBackupDialog = true },
                    ) { Text("Restore encrypted backup") }
                }
            }
        }
    }

    if (showBackupDialog) {
        val restoring = exportMode == ExportMode.Restore
        AlertDialog(
            onDismissRequest = {
                showBackupDialog = false
                backupPassword = ""
                exportMode = null
            },
            title = { Text(if (restoring) "Restore backup" else "Create backup") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        if (restoring) "Enter the password used to encrypt this MilkTrack backup."
                        else "Choose a password with at least 8 characters. You will need it to restore this backup.",
                        color = NativeMuted,
                        fontSize = 12.sp,
                    )
                    OutlinedTextField(
                        value = backupPassword,
                        onValueChange = { backupPassword = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Backup password") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    )
                }
            },
            confirmButton = {
                Button(
                    enabled = backupPassword.length >= 8,
                    onClick = {
                        val mode = exportMode
                        showBackupDialog = false
                        when (mode) {
                            ExportMode.Backup -> backupLauncher.launch("MilkTrack_Encrypted_Backup.mtb")
                            ExportMode.Restore -> restorePasswordLauncher.launch(arrayOf("*/*"))
                            else -> Unit
                        }
                    },
                ) { Text(if (restoring) "Choose backup" else "Choose save location") }
            },
            dismissButton = {
                TextButton(onClick = {
                    showBackupDialog = false
                    backupPassword = ""
                    exportMode = null
                }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun WorkbookPreviewRow(values: List<String>, header: Boolean = false) {
    Text(
        values.joinToString("  |  "),
        color = if (header) NativeForest else NativeMuted,
        fontWeight = if (header) FontWeight.SemiBold else FontWeight.Normal,
        fontSize = if (header) 10.sp else 9.sp,
        maxLines = 3,
    )
}

private enum class ExportMode {
    Master,
    Period,
    Backup,
    Restore,
}
