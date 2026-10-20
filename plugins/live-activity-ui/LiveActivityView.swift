import SwiftUI
import WidgetKit

#if canImport(ActivityKit)

  // Echo's Live Activity design. Replaces the expo-live-activity layout; the module that
  // starts, updates and stops the activity is unchanged, so the state it carries is the
  // library's: title, subtitle, timerEndDateInMilliseconds, progress, imageName.
  //
  // Echo conventions on top of that state (see lib/core/liveActivity.ts):
  //  - imageName says what the card is: live_timer (Pomodoro), live_mic (voice memo),
  //    live_post (upload in progress), live_done (finished). The same names are the glyphs.
  //  - Pomodoro: timerEndDateInMilliseconds is the end time and progress is the START time
  //    in milliseconds, so the ring and bar fill against the real length of the session.
  //  - Voice memo: progress is the START time in milliseconds, and the elapsed time counts
  //    up on its own, with no per-second updates from the app.

  enum EchoKind {
    case timer, recording, publishing, done, other

    init(_ state: LiveActivityAttributes.ContentState) {
      switch state.imageName {
      case "live_timer": self = .timer
      case "live_mic": self = .recording
      case "live_post": self = .publishing
      case "live_done": self = .done
      default: self = .other
      }
    }
  }

  extension LiveActivityAttributes.ContentState {
    var kind: EchoKind { EchoKind(self) }

    var endDate: Date? {
      timerEndDateInMilliseconds.map { Date(timeIntervalSince1970: $0 / 1000) }
    }

    /// When the session started: for a timer, the start of the ring; for a recording, zero of the clock.
    var startDate: Date? {
      guard let progress, progress > 1_000_000_000 else { return nil }
      return Date(timeIntervalSince1970: progress / 1000)
    }

    /// The span a ring or bar fills over. Falls back to "from now" when the start was not sent.
    var span: ClosedRange<Date>? {
      guard let end = endDate else { return nil }
      let start = startDate ?? Date()
      return start ... max(start, end)
    }
  }

  struct EchoGlyph: View {
    let name: String?
    let size: CGFloat

    var body: some View {
      if let name {
        Image.dynamic(assetNameOrPath: name)
          .resizable()
          .scaledToFit()
          .frame(width: size, height: size)
      }
    }
  }

  /// The time that matters for this card, as text the system keeps moving by itself.
  struct EchoClock: View {
    let state: LiveActivityAttributes.ContentState
    var font: Font = .system(size: 28, weight: .semibold, design: .rounded)

    var body: some View {
      Group {
        switch state.kind {
        case .timer:
          if let span = state.span {
            Text(timerInterval: span, pauseTime: nil, countsDown: true, showsHours: false)
          }
        case .recording:
          if let start = state.startDate {
            Text(start, style: .timer)
          }
        default:
          EmptyView()
        }
      }
      .font(font)
      .monospacedDigit()
      .multilineTextAlignment(.trailing)
      .minimumScaleFactor(0.7)
      .lineLimit(1)
    }
  }

  struct LiveActivityView: View {
    let contentState: LiveActivityAttributes.ContentState
    let attributes: LiveActivityAttributes

    private var tint: Color {
      attributes.progressViewTint.map { Color(hex: $0) } ?? Color(hex: "#9DB35F")
    }

    private var hasClock: Bool {
      contentState.kind == .timer || contentState.kind == .recording
    }

    var body: some View {
      VStack(alignment: .leading, spacing: 12) {
        HStack(spacing: 14) {
          EchoGlyph(name: contentState.imageName, size: 46)

          VStack(alignment: .leading, spacing: 2) {
            Text(contentState.title)
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(attributes.titleColor.map { Color(hex: $0) } ?? .white)
              .lineLimit(1)
            if let subtitle = contentState.subtitle {
              Text(subtitle)
                .font(.system(size: 14))
                .foregroundStyle(attributes.subtitleColor.map { Color(hex: $0) } ?? .white.opacity(0.7))
                .lineLimit(1)
            }
          }

          Spacer(minLength: 8)

          if hasClock {
            EchoClock(state: contentState)
              .foregroundStyle(.white)
              .frame(width: 104, alignment: .trailing)
          }
        }

        if contentState.kind == .timer, let span = contentState.span {
          ProgressView(timerInterval: span, countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
            .progressViewStyle(.linear)
            .tint(tint)
        }
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 16)
    }
  }

#endif
