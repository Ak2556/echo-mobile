package expo.modules.echomedia

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer

/**
 * Two things Android's pickers do not give us:
 *
 *  - trimVideo: cut a clip without re-encoding. MediaExtractor reads the source,
 *    MediaMuxer writes the samples between the two times, so a trim is instant
 *    and lossless. The catch of a lossless cut is that video can only start on a
 *    keyframe: the clip begins at the keyframe at or before the requested start,
 *    which is at most a GOP (usually under two seconds) early.
 *  - saveToGallery: write a file into Pictures/Echo or Movies/Echo through
 *    MediaStore. On Android 10+ an app may add its own files there with no
 *    permission at all, which is why this is not expo-media-library: that module
 *    asks for the broad READ_MEDIA_* grants Play makes a developer justify.
 */
class EchoMediaModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "React context is not available", null)

  override fun definition() = ModuleDefinition {
    Name("EchoMedia")

    AsyncFunction("trimVideo") { uri: String, startMs: Double, endMs: Double ->
      trim(uri, startMs, endMs)
    }

    AsyncFunction("saveToGallery") { uri: String, mimeType: String ->
      save(uri, mimeType)
    }

    AsyncFunction("videoDurationMs") { uri: String ->
      durationMs(uri)
    }

    AsyncFunction("frameAt") { uri: String, ms: Double, maxWidth: Int ->
      frame(uri, ms, maxWidth)
    }
  }

  /**
   * A still from the video as a cached JPEG. It takes the nearest keyframe, which
   * is fast and is exactly where a lossless trim starting here would begin.
   */
  private fun frame(uri: String, ms: Double, maxWidth: Int): String {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(context, Uri.parse(uri))
      val full = retriever.getFrameAtTime((ms * 1000).toLong(), MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
        ?: throw CodedException("ERR_FRAME", "No frame at that time", null)
      val width = maxWidth.coerceAtLeast(16)
      val bitmap = if (full.width > width) {
        Bitmap.createScaledBitmap(full, width, (full.height * width.toFloat() / full.width).toInt().coerceAtLeast(1), true)
      } else {
        full
      }
      val key = (uri.hashCode().toLong() shl 24) xor ms.toLong() xor width.toLong()
      val file = File(context.cacheDir, "echo_frame_$key.jpg")
      if (!file.exists()) {
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 80, it) }
      }
      return Uri.fromFile(file).toString()
    } catch (e: Exception) {
      if (e is CodedException) throw e
      throw CodedException("ERR_FRAME", e.message ?: "Could not read a frame", e)
    } finally {
      retriever.release()
    }
  }

  /** Read the length from the container instead of waiting on a player to report it. */
  private fun durationMs(uri: String): Double {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(context, Uri.parse(uri))
      return retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: 0.0
    } catch (e: Exception) {
      throw CodedException("ERR_DURATION", e.message ?: "Could not read the video", e)
    } finally {
      retriever.release()
    }
  }

  private fun trim(uri: String, startMs: Double, endMs: Double): String {
    if (startMs < 0 || endMs <= startMs) {
      throw CodedException("ERR_TRIM_RANGE", "Trim range is empty", null)
    }
    val source = Uri.parse(uri)
    val startUs = (startMs * 1000).toLong()
    val endUs = (endMs * 1000).toLong()

    val out = File(context.cacheDir, "echo_trim_${System.currentTimeMillis()}.mp4")
    val extractor = MediaExtractor()
    var muxer: MediaMuxer? = null
    var muxerStarted = false
    try {
      extractor.setDataSource(context, source, null)

      // Rotation lives in container metadata, not in the samples.
      var rotation = 0
      val retriever = MediaMetadataRetriever()
      try {
        retriever.setDataSource(context, source)
        rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      } catch (_: Exception) {
        // Missing metadata is not fatal: the clip just keeps its default orientation.
      } finally {
        retriever.release()
      }

      muxer = MediaMuxer(out.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      muxer.setOrientationHint(rotation)

      val muxerTrack = HashMap<Int, Int>()
      var videoTrack = -1
      var maxInput = 1 shl 20
      for (i in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
        if (!mime.startsWith("video/") && !mime.startsWith("audio/")) continue
        try {
          muxerTrack[i] = muxer.addTrack(format)
        } catch (e: Exception) {
          throw CodedException("ERR_UNSUPPORTED_FORMAT", "This video's format cannot be trimmed on this device ($mime)", e)
        }
        extractor.selectTrack(i)
        if (mime.startsWith("video/") && videoTrack < 0) videoTrack = i
        if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
          maxInput = maxOf(maxInput, format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE))
        }
      }
      if (muxerTrack.isEmpty()) throw CodedException("ERR_NO_TRACKS", "No video or audio found", null)

      // Find the keyframe the clip will actually start on, so every track can be
      // shifted by the same amount and stay in sync.
      var offsetUs = startUs
      if (videoTrack >= 0) {
        extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
        val sync = extractor.sampleTime
        if (sync >= 0) offsetUs = sync
      }
      extractor.seekTo(offsetUs, MediaExtractor.SEEK_TO_CLOSEST_SYNC)

      muxer.start()
      muxerStarted = true

      val buffer = ByteBuffer.allocate(maxInput)
      val info = MediaCodec.BufferInfo()
      var written = 0
      while (true) {
        val size = extractor.readSampleData(buffer, 0)
        if (size < 0) break
        val time = extractor.sampleTime
        if (time > endUs) break
        val track = muxerTrack[extractor.sampleTrackIndex]
        if (track != null) {
          info.offset = 0
          info.size = size
          info.presentationTimeUs = maxOf(0L, time - offsetUs)
          info.flags = if (extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
          muxer.writeSampleData(track, buffer, info)
          written++
        }
        extractor.advance()
      }
      if (written == 0) throw CodedException("ERR_TRIM_RANGE", "Nothing to write in that range", null)

      muxer.stop()
      muxerStarted = false
      return Uri.fromFile(out).toString()
    } catch (e: Exception) {
      out.delete()
      if (e is CodedException) throw e
      throw CodedException("ERR_TRIM_FAILED", e.message ?: "Trim failed", e)
    } finally {
      try {
        if (muxerStarted) muxer?.stop()
      } catch (_: Exception) {
      }
      try {
        muxer?.release()
      } catch (_: Exception) {
      }
      extractor.release()
    }
  }

  private fun save(uri: String, mimeType: String): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      // Below Android 10 this needs WRITE_EXTERNAL_STORAGE, which the app blocks.
      throw CodedException("ERR_UNSUPPORTED_ANDROID", "Saving to the gallery needs Android 10 or newer", null)
    }
    val resolver = context.contentResolver
    val isVideo = mimeType.startsWith("video/")
    val collection = if (isVideo) {
      MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    } else {
      MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    }
    val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType) ?: if (isVideo) "mp4" else "jpg"
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, "Echo_${System.currentTimeMillis()}.$ext")
      put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
      put(
        MediaStore.MediaColumns.RELATIVE_PATH,
        (if (isVideo) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_PICTURES) + "/Echo",
      )
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    val target = resolver.insert(collection, values)
      ?: throw CodedException("ERR_SAVE_FAILED", "Could not create the gallery entry", null)
    try {
      val input = resolver.openInputStream(Uri.parse(uri))
        ?: throw CodedException("ERR_SAVE_FAILED", "Could not read the file", null)
      input.use { src ->
        (resolver.openOutputStream(target) ?: throw CodedException("ERR_SAVE_FAILED", "Could not write to the gallery", null)).use { dst ->
          src.copyTo(dst)
        }
      }
      val done = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
      resolver.update(target, done, null, null)
      return target.toString()
    } catch (e: Exception) {
      resolver.delete(target, null, null)
      if (e is CodedException) throw e
      throw CodedException("ERR_SAVE_FAILED", e.message ?: "Save failed", e)
    }
  }
}
