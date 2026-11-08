package com.milktrack.app.auth

import android.content.Context
import android.content.Intent
import android.net.Uri
import net.openid.appauth.AuthState
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.CodeVerifierUtil
import net.openid.appauth.ResponseTypeValues
import com.milktrack.app.BuildConfig
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

internal class CognitoAuthManager(context: Context) {
    private val authService = AuthorizationService(context.applicationContext)
    private val store = EncryptedAuthStateStore(context.applicationContext)
    private val domain = BuildConfig.COGNITO_DOMAIN.trim().trimEnd('/')
    private val clientId = BuildConfig.COGNITO_CLIENT_ID.trim()

    val isConfigured: Boolean
        get() = domain.isNotBlank() && clientId.isNotBlank() && isHttpsDomain(domain)

    fun createAuthorizationIntent(): Intent {
        check(isConfigured) {
            "Native sign-in is not configured for this Android build."
        }

        val verifier = CodeVerifierUtil.generateRandomCodeVerifier()
        val request = AuthorizationRequest.Builder(
            getServiceConfiguration(),
            clientId,
            ResponseTypeValues.CODE,
            REDIRECT_URI,
        )
            .setScopes("openid", "email", "profile")
            .setCodeVerifier(
                verifier,
                CodeVerifierUtil.deriveCodeVerifierChallenge(verifier),
                AuthorizationRequest.CODE_CHALLENGE_METHOD_S256,
            )
            .build()
        return authService.getAuthorizationRequestIntent(request)
    }

    suspend fun restoreSession(): String? {
        val state = store.read() ?: return null
        if (!state.isAuthorized && state.refreshToken == null) {
            store.clear()
            return null
        }
        return getFreshIdToken(state)
    }

    suspend fun getCurrentIdToken(): String {
        val state = store.read()
            ?: throw IllegalStateException("Sign in to MilkTrack to continue.")
        return getFreshIdToken(state)
    }

    suspend fun completeSignIn(response: AuthorizationResponse): String {
        val state = AuthState().apply { update(response, null) }
        return suspendCancellableCoroutine { continuation ->
            authService.performTokenRequest(response.createTokenExchangeRequest()) { tokenResponse, exception ->
                if (!continuation.isActive) return@performTokenRequest
                if (exception != null) {
                    continuation.resumeWithException(
                        IllegalStateException(
                            exception.errorDescription ?: "Sign-in could not be completed.",
                        ),
                    )
                    return@performTokenRequest
                }
                if (tokenResponse?.idToken.isNullOrBlank()) {
                    continuation.resumeWithException(
                        IllegalStateException("Cognito did not return an ID token."),
                    )
                    return@performTokenRequest
                }

                state.update(tokenResponse, null)
                try {
                    store.write(state)
                    continuation.resume(requireNotNull(tokenResponse?.idToken))
                } catch (error: Exception) {
                    continuation.resumeWithException(error)
                }
            }
        }
    }

    fun signOut() {
        store.clear()
    }

    fun dispose() {
        authService.dispose()
    }

    private suspend fun getFreshIdToken(state: AuthState): String =
        suspendCancellableCoroutine { continuation ->
            state.performActionWithFreshTokens(authService) { _, idToken, exception ->
                if (!continuation.isActive) return@performActionWithFreshTokens
                if (exception != null) {
                    continuation.resumeWithException(
                        IllegalStateException(
                            exception.errorDescription ?: "Your saved sign-in session could not be refreshed.",
                        ),
                    )
                    return@performActionWithFreshTokens
                }
                if (idToken.isNullOrBlank()) {
                    continuation.resumeWithException(
                        IllegalStateException("Cognito did not return an ID token for the saved session."),
                    )
                    return@performActionWithFreshTokens
                }

                try {
                    store.write(state)
                    continuation.resume(idToken)
                } catch (error: Exception) {
                    continuation.resumeWithException(error)
                }
            }
        }

    private fun getServiceConfiguration(): AuthorizationServiceConfiguration {
        check(isHttpsDomain(domain)) {
            "The Cognito hosted domain must be a valid HTTPS domain."
        }
        return AuthorizationServiceConfiguration(
            Uri.parse("$domain/oauth2/authorize"),
            Uri.parse("$domain/oauth2/token"),
        )
    }

    private fun isHttpsDomain(value: String): Boolean {
        val uri = Uri.parse(value)
        return uri.scheme == "https" &&
            !uri.host.isNullOrBlank() &&
            uri.userInfo == null &&
            (uri.path.isNullOrEmpty() || uri.path == "/") &&
            uri.query == null &&
            uri.fragment == null
    }

    private companion object {
        val REDIRECT_URI: Uri = Uri.parse("com.milktrack.app:/oauth2redirect")
    }
}
