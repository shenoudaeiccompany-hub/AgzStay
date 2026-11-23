# Keep WebView & AppCompat classes used natively or via reflection
-keepattributes *Annotation*
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-dontwarn android.webkit.**
-dontwarn androidx.webkit.**
