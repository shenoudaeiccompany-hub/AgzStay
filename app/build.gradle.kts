plugins {
    id("com.android.application")
}

android {
    namespace = "com.masayef.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.masayef.app"
        minSdk = 24
        targetSdk = 36
        versionCode = (findProperty("VERSION_CODE") as? String)?.toIntOrNull() ?: 1
        versionName = (findProperty("VERSION_NAME") as? String) ?: "1.0.0"
    }

    signingConfigs {
        create("debugConfig") {
            storeFile = file("${rootDir}/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        create("release") {
            storeFile = file("${rootDir}/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("debugConfig")
        }
        getByName("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

val syncWebAssets by tasks.registering(Sync::class) {
    from("${rootDir}/dist")
    into("${projectDir}/src/main/assets")
}

tasks.named("preBuild").configure {
    dependsOn(syncWebAssets)
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
