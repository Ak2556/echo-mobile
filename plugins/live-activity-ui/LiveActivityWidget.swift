import ActivityKit
import SwiftUI
import WidgetKit

// The attributes must match the ones the app target builds (ios/LiveActivityAttributes.swift,
// from expo-live-activity). Keep the shape identical.
struct LiveActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var title: String
    var subtitle: String?
    var timerEndDateInMilliseconds: Double?
    var progress: Double?
    var imageName: String?
    var dynamicIslandImageName: String?
  }

  var name: String
  var backgroundColor: String?
  var titleColor: String?
  var subtitleColor: String?
  var progressViewTint: String?
  var progressViewLabelColor: String?
  var deepLinkUrl: String?
  var timerType: DynamicIslandTimerType?
  var padding: Int?
  var paddingDetails: PaddingDetails?
  var imagePosition: String?
  var imageWidth: Int?
  var imageHeight: Int?
  var imageWidthPercent: Double?
  var imageHeightPercent: Double?
  var imageAlign: String?
  var contentFit: String?

  enum DynamicIslandTimerType: String, Codable {
    case circular
    case digital
  }

  struct PaddingDetails: Codable, Hashable {
    var top: Int?
    var bottom: Int?
    var left: Int?
    var right: Int?
    var vertical: Int?
    var horizontal: Int?
  }
}

struct LiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LiveActivityAttributes.self) { context in
      LiveActivityView(contentState: context.state, attributes: context.attributes)
        .activityBackgroundTint(
          context.attributes.backgroundColor.map { Color(hex: $0) }
        )
        .activitySystemActionForegroundColor(Color.white)
        .echoWidgetURL(context.attributes.deepLinkUrl)
    } dynamicIsland: { context in
      let state = context.state
      let tint = context.attributes.progressViewTint.map { Color(hex: $0) } ?? Color(hex: "#9DB35F")
      let hasClock = state.kind == .timer || state.kind == .recording

      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading, priority: 1) {
          HStack(spacing: 10) {
            EchoBadge(state: state, size: 40, tint: tint)
            VStack(alignment: .leading, spacing: 1) {
              Text(state.title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
              if let subtitle = state.subtitle {
                Text(subtitle)
                  .font(.system(size: 13))
                  .foregroundStyle(.white.opacity(0.7))
                  .lineLimit(1)
              }
            }
          }
          .padding(.leading, 4)
          .dynamicIsland(verticalPlacement: .belowIfTooWide)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if hasClock {
            // Text(timerInterval:) takes all the width it is offered, so the clock gets a fixed one.
            EchoClock(state: state, font: .system(size: 22, weight: .semibold, design: .rounded))
              .foregroundStyle(.white)
              .frame(width: 84, height: 40, alignment: .trailing)
              .padding(.trailing, 4)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          if hasClock {
            HStack(spacing: 12) {
              if state.kind == .timer, let span = state.span {
                ProgressView(timerInterval: span, countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                  .progressViewStyle(.linear)
                  .tint(tint)
              } else if state.kind == .recording {
                EchoBars(level: state.level, tint: tint)
                Spacer(minLength: 0)
              } else {
                Spacer(minLength: 0)
              }
              EchoStopLink(attributes: context.attributes, state: state)
            }
            .padding(.horizontal, 4)
            .padding(.top, 4)
          }
        }
      } compactLeading: {
        EchoGlyph(name: state.dynamicIslandImageName ?? state.imageName, size: 22)
      } compactTrailing: {
        if hasClock {
          EchoClock(state: state, font: .system(size: 14, weight: .semibold, design: .rounded))
            .foregroundStyle(tint)
            .frame(width: 50, alignment: .trailing)
        }
      } minimal: {
        EchoBadge(state: state, size: 24, tint: tint)
      }
      .widgetURL(echoURL(context.attributes.deepLinkUrl))
    }
  }
}
