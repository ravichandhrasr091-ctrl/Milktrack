package com.milktrack.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.milktrack.app.auth.CognitoAuthManager
import com.milktrack.app.data.AssistantMessage
import com.milktrack.app.data.NativeReceipt
import com.milktrack.app.data.NativeReceiptApi
import kotlinx.coroutines.launch

@Composable
internal fun NativeAssistantDialog(
    receipts: List<NativeReceipt>,
    authManager: CognitoAuthManager,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val messages = remember {
        mutableStateListOf(
            AssistantMessage(
                "assistant",
                "Ask about your verified collection totals. The assistant does not receive receipt photos.",
            ),
        )
    }
    var question by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { if (!sending) onDismiss() },
        title = { Text("MilkTrack Assistant") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth().heightIn(min = 100.dp, max = 330.dp),
                    contentPadding = PaddingValues(vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(messages) { message ->
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            color = if (message.role == "user") NativeMint else Color.White,
                            shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
                            shadowElevation = 1.dp,
                        ) {
                            Column(modifier = Modifier.padding(11.dp)) {
                                Text(
                                    if (message.role == "user") "You" else "Assistant",
                                    color = NativeForest,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(message.content, color = NativeMuted, fontSize = 12.sp)
                            }
                        }
                    }
                    if (sending) {
                        item {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                CircularProgressIndicator(modifier = Modifier.padding(4.dp), strokeWidth = 2.dp)
                                Text("Checking verified totals…", color = NativeMuted, fontSize = 12.sp)
                            }
                        }
                    }
                }
                error?.let { NativeStatus(it, error = true) }
                OutlinedTextField(
                    value = question,
                    onValueChange = { question = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Ask a collection question") },
                    placeholder = { Text("How much milk this month?") },
                    maxLines = 3,
                    enabled = !sending,
                )
                Text(
                    "Only verified totals are shared; receipt images are never sent.",
                    color = NativeMuted,
                    fontSize = 10.sp,
                )
            }
        },
        confirmButton = {
            Button(
                enabled = !sending && question.isNotBlank(),
                onClick = {
                    val prompt = question.trim()
                    question = ""
                    error = null
                    messages += AssistantMessage("user", prompt)
                    sending = true
                    scope.launch {
                        try {
                            val token = authManager.getCurrentIdToken()
                            val answer = NativeReceiptApi.askAssistant(
                                idToken = token,
                                question = prompt,
                                history = messages.dropLast(1).takeLast(6),
                                receipts = receipts,
                            )
                            messages += AssistantMessage("assistant", answer)
                        } catch (failure: Exception) {
                            error = failure.message ?: "The assistant could not answer right now."
                        } finally {
                            sending = false
                        }
                    }
                },
            ) {
                if (sending) CircularProgressIndicator(modifier = Modifier.padding(2.dp), strokeWidth = 2.dp)
                else {
                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null)
                    Text(" Ask")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !sending) { Text("Close") }
        },
    )
}
