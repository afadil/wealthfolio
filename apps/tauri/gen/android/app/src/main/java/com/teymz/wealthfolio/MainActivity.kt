package com.teymz.wealthfolio

import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onPause() {
    window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    // The manifest handles uiMode changes without recreating the activity, so
    // re-apply edge-to-edge to give the system bar icons the new light/dark mode.
    enableEdgeToEdge()
  }
}
