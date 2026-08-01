package com.mercadinhoaldilene.app

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.decode.SvgDecoder
import com.mercadinhoaldilene.app.push.PushNotifications

class AiMercApplication : Application(), ImageLoaderFactory {
    override fun onCreate() {
        super.onCreate()
        PushNotifications.initialize(this)
    }

    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .components {
                add(SvgDecoder.Factory())
            }
            .build()
    }
}
