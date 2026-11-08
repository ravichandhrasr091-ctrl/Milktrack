package com.milktrack.app

import android.app.Activity
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import com.milktrack.app.auth.CognitoAuthManager
import kotlinx.coroutines.launch
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationResponse

private val Forest = Color(0xFF153D2E)
private val Mint = Color(0xFFD9F0E2)
private val PageBackground = Color(0xFFF5F8F5)
private val SecondaryText = Color(0xFF58675F)
private val ErrorBackground = Color(0xFFFFECE8)
private val ErrorText = Color(0xFF8A281B)

class MainActivity : ComponentActivity() {
    private lateinit var authManager: CognitoAuthManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        authManager = CognitoAuthManager(applicationContext)
        window.statusBarColor = android.graphics.Color.rgb(21, 61, 46)
        window.navigationBarColor = android.graphics.Color.rgb(245, 248, 245)
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = false
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightNavigationBars = true

        setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = Forest,
                    onPrimary = Color.White,
                    secondary = Mint,
                    background = PageBackground,
                    surface = Color.White,
                    error = ErrorText,
                ),
            ) {
                MilkTrackApp(authManager)
            }
        }
    }

    override fun onDestroy() {
        authManager.dispose()
        super.onDestroy()
    }
}

@Composable
private fun MilkTrackApp(authManager: CognitoAuthManager) {
    var isSignedIn by remember { mutableStateOf<Boolean?>(null) }
    var isBusy by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val authorizationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val responseIntent = result.data
        val response = responseIntent?.let(AuthorizationResponse::fromIntent)
        val authorizationError = responseIntent?.let(AuthorizationException::fromIntent)
        when {
            authorizationError != null -> {
                errorMessage =
                    authorizationError.errorDescription ?: "Sign-in could not be completed."
            }
            response != null -> scope.launch {
                isBusy = true
                errorMessage = null
                try {
                    authManager.completeSignIn(response)
                    isSignedIn = true
                } catch (error: Exception) {
                    errorMessage = error.message ?: "Sign-in could not be completed."
                } finally {
                    isBusy = false
                }
            }
            result.resultCode == Activity.RESULT_CANCELED -> {
                errorMessage = "Sign-in was cancelled."
            }
            else -> {
                errorMessage = "Sign-in returned an incomplete response. Please try again."
            }
        }
    }

    LaunchedEffect(authManager) {
        try {
            isSignedIn = authManager.restoreSession() != null
        } catch (error: Exception) {
            isSignedIn = false
            errorMessage = error.message ?: "The saved sign-in session could not be restored."
        }
    }

    when (isSignedIn) {
        null -> LoadingScreen()
        true -> NativeWorkspace(
            authManager = authManager,
            onSignOut = {
                try {
                    authManager.signOut()
                    errorMessage = null
                    isSignedIn = false
                } catch (error: Exception) {
                    errorMessage = error.message ?: "Sign-out could not be completed."
                }
            },
        )
        false -> SignInScreen(
            isConfigured = authManager.isConfigured,
            isBusy = isBusy,
            errorMessage = errorMessage,
            onSignIn = {
                errorMessage = null
                try {
                    authorizationLauncher.launch(authManager.createAuthorizationIntent())
                } catch (error: Exception) {
                    errorMessage = error.message ?: "Sign-in could not be started."
                }
            },
            onClearSavedSession = {
                try {
                    authManager.signOut()
                    errorMessage = null
                } catch (error: Exception) {
                    errorMessage = error.message ?: "The saved sign-in session could not be cleared."
                }
            },
        )
    }
}

@Composable
private fun LoadingScreen() {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = PageBackground,
    ) {
        Box(contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = Forest)
        }
    }
}

@Composable
private fun SignInScreen(
    isConfigured: Boolean,
    isBusy: Boolean,
    errorMessage: String?,
    onSignIn: () -> Unit,
    onClearSavedSession: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = PageBackground,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 32.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier.widthIn(max = 440.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .background(Forest, CircleShape)
                            .padding(12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "M",
                            color = Color.White,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Column {
                        Text(
                            text = "MilkTrack",
                            color = Forest,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "MILK COLLECTION MANAGER",
                            color = SecondaryText,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            letterSpacing = 1.1.sp,
                        )
                    }
                }

                Spacer(Modifier.height(32.dp))

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(28.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                ) {
                    Column(
                        modifier = Modifier.padding(28.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Text(
                            text = "PRIVATE WORKSPACE",
                            color = Forest,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.2.sp,
                        )
                        Text(
                            text = "Sign in to MilkTrack",
                            color = Forest,
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "Sign in to access your dairy collection records.",
                            color = SecondaryText,
                            fontSize = 15.sp,
                            lineHeight = 22.sp,
                        )

                        Button(
                            onClick = onSignIn,
                            enabled = isConfigured && !isBusy,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(54.dp),
                            shape = RoundedCornerShape(16.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Forest,
                                contentColor = Color.White,
                            ),
                        ) {
                            if (isBusy) {
                                CircularProgressIndicator(
                                    modifier = Modifier.height(20.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp,
                                )
                            } else {
                                Text(
                                    text = "Continue to secure sign-in",
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }

                        Text(
                            text = "Create an account or reset your password on the secure sign-in page. MilkTrack does not store your password.",
                            color = SecondaryText,
                            fontSize = 13.sp,
                            lineHeight = 19.sp,
                        )

                        if (!isConfigured) {
                            MessageCard(
                                message = "Cognito is not configured in this Android build. Set the public hosted domain and app client ID to enable sign-in.",
                                background = Mint,
                                foreground = Forest,
                            )
                        }
                        if (errorMessage != null) {
                            MessageCard(
                                message = errorMessage,
                                background = ErrorBackground,
                                foreground = ErrorText,
                            )
                            OutlinedButton(
                                onClick = onClearSavedSession,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("Clear saved sign-in")
                            }
                        }
                    }
                }

                Spacer(Modifier.height(20.dp))
                Text(
                    text = "Sign-in opens in your browser and returns directly to the MilkTrack app.",
                    color = SecondaryText,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun MessageCard(
    message: String,
    background: Color,
    foreground: Color,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = background,
        shape = RoundedCornerShape(14.dp),
    ) {
        Text(
            text = message,
            modifier = Modifier.padding(14.dp),
            color = foreground,
            fontSize = 13.sp,
            lineHeight = 19.sp,
        )
    }
}
