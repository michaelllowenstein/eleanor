import {
  createElement,
} from "react";

import type {
  CSSProperties,
  ReactElement,
} from "react";

import type {
  VoiceConnectionState,
} from "../../core/schema/models/realtime";

export interface VoiceOrbProps {
  readonly state:
    VoiceConnectionState;

  readonly inputLevel: number;

  readonly outputLevel: number;
}

interface OrbPresentation {
  readonly label: string;
  readonly coreAnimation: string;
  readonly ringAnimation: string;
  readonly opacity: number;
}

const PRESENTATION_BY_STATE:
  Record<
    VoiceConnectionState,
    OrbPresentation
  > = {
    offline: {
      label:
        "Assistant offline",

      coreAnimation:
        "none",

      ringAnimation:
        "none",

      opacity: 0.4
    },

    connecting: {
      label:
        "Assistant connecting",

      coreAnimation:
        "eleanorPulse 1.4s ease-in-out infinite",

      ringAnimation:
        "eleanorRotate 5s linear infinite",

      opacity: 0.75
    },

    listening: {
      label:
        "Assistant listening",

      coreAnimation:
        "eleanorBreathe 2.2s ease-in-out infinite",

      ringAnimation:
        "eleanorRotate 12s linear infinite",

      opacity: 1
    },

    thinking: {
      label:
        "Assistant thinking",

      coreAnimation:
        "eleanorThinking 1.5s ease-in-out infinite",

      ringAnimation:
        "eleanorRotate 2.3s linear infinite",

      opacity: 1
    },

    speaking: {
      label:
        "Assistant speaking",

      coreAnimation:
        "eleanorBreathe 1.2s ease-in-out infinite",

      ringAnimation:
        "eleanorRotate 7s linear infinite",

      opacity: 1
    },

    error: {
      label:
        "Assistant connection error",

      coreAnimation:
        "eleanorError 1.4s ease-in-out infinite",

      ringAnimation:
        "none",

      opacity: 0.7
    }
  };

function clampLevel(
  level: number,
): number {
  return Math.min(
    1,
    Math.max(0, level),
  );
}

export function VoiceOrb(
  props: VoiceOrbProps,
): ReactElement {
  const presentation =
    PRESENTATION_BY_STATE[
      props.state
    ];

  const inputLevel =
    clampLevel(
      props.inputLevel,
    );

  const outputLevel =
    clampLevel(
      props.outputLevel,
    );

  const inputScale =
    1 +
    inputLevel * 0.22;

  const outputScale =
    1 +
    outputLevel * 0.18;

  const inputOpacity =
    0.15 +
    inputLevel * 0.75;

  const outputOpacity =
    0.2 +
    outputLevel * 0.8;

  const microphoneRingStyle:
    CSSProperties = {
      transform:
        `scale(${inputScale})`,

      opacity:
        props.state === "listening"
          ? inputOpacity
          : 0.12,

      boxShadow:
        inputLevel > 0.15
          ? `0 0 ${
              18 +
              inputLevel * 55
            }px rgba(56,196,255,${
              0.15 +
              inputLevel * 0.3
            })`
          : "none"
    };

  const assistantEnergyStyle:
    CSSProperties = {
      transform:
        `scale(${outputScale})`,

      opacity:
        props.state === "speaking"
          ? outputOpacity
          : 0.18,

      filter:
        `blur(${
          14 +
          outputLevel * 10
        }px)`
    };

  const assistantCoreWrapperStyle:
    CSSProperties = {
      transform:
        props.state === "speaking"
          ? `scale(${outputScale})`
          : "scale(1)",

      transition:
        "transform 70ms linear"
    };

  const animatedCoreStyle:
    CSSProperties = {
      animation:
        presentation.coreAnimation,

      opacity:
        presentation.opacity
    };

  const ringStyle:
    CSSProperties = {
      animation:
        presentation.ringAnimation
    };

  return createElement(
    "div",
    {
      className:
        "relative grid size-72 " +
        "select-none place-items-center",

      role: "img",

      "aria-label":
        presentation.label,

      "data-state":
        props.state
    },

    createElement(
      "style",
      null,
      `
        @keyframes eleanorBreathe {
          0%, 100% {
            transform: scale(1);
            filter: brightness(.96);
          }

          50% {
            transform: scale(1.045);
            filter: brightness(1.13);
          }
        }

        @keyframes eleanorPulse {
          0%, 100% {
            transform: scale(.96);
            filter: brightness(.85);
          }

          50% {
            transform: scale(1.07);
            filter: brightness(1.3);
          }
        }

        @keyframes eleanorThinking {
          0%, 100% {
            transform: scale(.98);
            filter: brightness(.95);
          }

          50% {
            transform: scale(1.04);
            filter: brightness(1.25);
          }
        }

        @keyframes eleanorRotate {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }

        @keyframes eleanorReverseRotate {
          from {
            transform: rotate(360deg);
          }

          to {
            transform: rotate(0deg);
          }
        }

        @keyframes eleanorError {
          0%, 100% {
            transform: scale(1);
            filter: brightness(.75);
          }

          50% {
            transform: scale(.97);
            filter: brightness(1.05);
          }
        }
      `,
    ),

    createElement("div", {
      className:
        "absolute size-64 " +
        "rounded-full " +
        "bg-eleanor-400/20 " +
        "transition-[opacity,transform] " +
        "duration-75",

      style:
        assistantEnergyStyle,

      "aria-hidden":
        true
    }),

    createElement("div", {
      className:
        "absolute inset-0 " +
        "rounded-full border " +
        "border-eleanor-400/15",

      "aria-hidden":
        true
    }),

    createElement("div", {
      className:
        "absolute inset-4 " +
        "rounded-full border " +
        "border-eleanor-400/25 " +
        "border-t-eleanor-300/70",

      style:
        ringStyle,

      "aria-hidden":
        true
    }),

    createElement("div", {
      className:
        "absolute inset-8 " +
        "rounded-full border " +
        "border-eleanor-300/50 " +
        "transition-[opacity,transform,box-shadow] " +
        "duration-75",

      style:
        microphoneRingStyle,

      "aria-hidden":
        true
    }),

    createElement("div", {
      className:
        "absolute inset-11 " +
        "rounded-full " +
        "border border-dashed " +
        "border-eleanor-300/25",

      style: {
        animation:
          props.state ===
          "thinking"
            ? "eleanorReverseRotate 3.5s linear infinite"
            : "eleanorReverseRotate 16s linear infinite"
      },

      "aria-hidden":
        true
    }),

    createElement(
      "div",
      {
        className:
          "relative grid size-40 " +
          "place-items-center " +
          "transition-transform " +
          "duration-75",

        style:
          assistantCoreWrapperStyle,

        "aria-hidden":
          true
      },

      createElement(
        "div",
        {
          className:
            "relative grid size-36 " +
            "place-items-center",

          style:
            animatedCoreStyle
        },

        createElement(
          "div",
          {
            className:
              "absolute size-36 " +
              "rounded-full " +
              "border " +
              "border-eleanor-300/60 " +
              "bg-[radial-gradient(" +
              "circle_at_35%_28%," +
              "rgba(255,255,255,.98)_0%," +
              "rgba(125,220,255,.92)_7%," +
              "rgba(56,196,255,.72)_18%," +
              "rgba(9,168,234,.38)_43%," +
              "rgba(7,17,31,.94)_74%)] " +
              "shadow-[0_0_25px_" +
              "rgba(56,196,255,.6)," +
              "0_0_80px_" +
              "rgba(9,168,234,.28)," +
              "inset_0_0_45px_" +
              "rgba(125,220,255,.25)]",
          },
        ),

        createElement(
          "div",
          {
            className:
              "absolute left-[30%] " +
              "top-[23%] size-5 " +
              "rounded-full " +
              "bg-white/65 blur-[2px]"
          },
        ),
      ),
    ),

    createElement(
      "div",
      {
        className:
          "absolute bottom-0 " +
          "flex gap-3 text-[9px] " +
          "font-medium uppercase " +
          "tracking-[0.18em] " +
          "text-slate-600"
      },

      createElement(
        "span",
        null,
        `MIC ${Math.round(
          inputLevel * 100,
        )}`,
      ),

      createElement(
        "span",
        null,
        `AI ${Math.round(
          outputLevel * 100,
        )}`,
      ),
    ),
  );
}
