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
      case "live_timer", "live_break": self = .timer
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

    /// Voice memo only: the microphone level, 0...1, carried in the date slot (a recording has no end).
    var level: Double { min(1, max(0, timerEndDateInMilliseconds ?? 0)) }

    /// The span a ring or bar fills over. Falls back to "from now" when the start was not sent.
    var span: ClosedRange<Date>? {
      guard let end = endDate else { return nil }
      let start = startDate ?? Date()
      return start ... max(start, end)
    }
  }

  /// The app's URL scheme, written in by plugins/withEchoLiveActivityUI.js from app.json. The widget
  /// extension's own Info.plist has no URL types, so reading Bundle.main finds nothing here (which
  /// is also why the library's tap-to-open never did anything).
  private let echoScheme: String? = "__ECHO_SCHEME__"

  func echoURL(_ base: String?, query: String? = nil) -> URL? {
    guard let base, let scheme = echoScheme, !scheme.isEmpty else { return nil }
    let path = base.hasPrefix("/") ? String(base.dropFirst()) : base
    return URL(string: "\(scheme)://\(path)" + (query.map { "?" + $0 } ?? ""))
  }

  extension View {
    /// Tapping the card opens the screen it belongs to.
    @ViewBuilder
    func echoWidgetURL(_ base: String?) -> some View {
      if let url = echoURL(base) { widgetURL(url) } else { self }
    }
  }

  /// A deep link back into the screen the card belongs to, carrying an action the screen performs
  /// once (liveAction) and a token (lt) so the same action can be sent again later.
  func echoActionURL(_ base: String?, _ action: String) -> URL? {
    echoURL(base, query: "liveAction=\(action)&lt=\(Int(Date().timeIntervalSince1970))")
  }

  /// Stop (a Pomodoro) or Stop & save (a recording). A Link opens Echo on that screen, which
  /// does the work: a Live Activity button cannot run the app's JavaScript by itself.
  struct EchoStopLink: View {
    let attributes: LiveActivityAttributes
    let state: LiveActivityAttributes.ContentState

    var body: some View {
      if state.kind == .timer || state.kind == .recording,
        let url = echoActionURL(attributes.deepLinkUrl, "stop")
      {
        Link(destination: url) {
          HStack(spacing: 6) {
            Image(systemName: "stop.fill").font(.system(size: 11, weight: .bold))
            Text(state.kind == .recording ? "Stop & save" : "Stop")
              .font(.system(size: 13, weight: .semibold))
          }
          .foregroundStyle(.white)
          .padding(.horizontal, 14)
          .padding(.vertical, 7)
          .background(Capsule().fill(Color.white.opacity(0.16)))
        }
      }
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

  /// A small equalizer for the voice memo. Its height follows the microphone level the app sends
  /// about once a second; the bars ease between levels, they do not loop on their own (iOS does not
  /// run continuous animation in a Live Activity).
  struct EchoBars: View {
    let level: Double
    let tint: Color
    private let shape: [Double] = [0.55, 0.9, 0.7, 1.0, 0.6, 0.85, 0.5]

    var body: some View {
      HStack(alignment: .center, spacing: 3) {
        ForEach(shape.indices, id: \.self) { i in
          Capsule()
            .fill(tint)
            .frame(width: 4, height: 5 + CGFloat(level) * 19 * CGFloat(shape[i]))
        }
      }
      .frame(height: 24)
      .animation(.easeOut(duration: 0.35), value: level)
    }
  }

  /// The glyph for a card. A Pomodoro wears a ring that drains by itself as the time runs down; a
  /// finished card shows a check that bounces in when the state changes to it.
  struct EchoBadge: View {
    let state: LiveActivityAttributes.ContentState
    let size: CGFloat
    let tint: Color

    var body: some View {
      switch state.kind {
      case .timer:
        if let span = state.span {
          ZStack {
            ProgressView(timerInterval: span, countsDown: true, label: { EmptyView() }, currentValueLabel: { EmptyView() })
              .progressViewStyle(.circular)
              .tint(tint)
              .frame(width: size, height: size)
            EchoGlyph(name: state.imageName, size: size * 0.6)
          }
        } else {
          EchoGlyph(name: state.imageName, size: size)
        }
      case .done:
        done
      default:
        EchoGlyph(name: state.imageName, size: size)
      }
    }

    @ViewBuilder private var done: some View {
      let check = Image(systemName: "checkmark.circle.fill")
        .font(.system(size: size * 0.95))
        .foregroundStyle(tint)
      if #available(iOS 17.0, *) {
        check.symbolEffect(.bounce, options: .nonRepeating, value: state.title)
      } else {
        check
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
          EchoBadge(state: contentState, size: 46, tint: tint)

          VStack(alignment: .leading, spacing: 2) {
            Text(contentState.title)
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(attributes.titleColor.map { Color(hex: $0) } ?? .white)
              .lineLimit(1)
              .contentTransition(.numericText())
            if let subtitle = contentState.subtitle {
              Text(subtitle)
                .font(.system(size: 14))
                .foregroundStyle(attributes.subtitleColor.map { Color(hex: $0) } ?? .white.opacity(0.7))
                .lineLimit(1)
                .contentTransition(.numericText())
            }
          }

          Spacer(minLength: 8)

          if hasClock {
            EchoClock(state: contentState)
              .foregroundStyle(.white)
              .frame(width: 104, alignment: .trailing)
          }
        }

        if hasClock {
          HStack(spacing: 14) {
            if contentState.kind == .timer, let span = contentState.span {
              ProgressView(timerInterval: span, countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                .progressViewStyle(.linear)
                .tint(tint)
            } else if contentState.kind == .recording {
              EchoBars(level: contentState.level, tint: tint)
              Spacer(minLength: 0)
            } else {
              Spacer(minLength: 0)
            }
            EchoStopLink(attributes: attributes, state: contentState)
          }
        }
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 16)
    }
  }

#endif
