import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  ViewChild,
  effect,
  inject,
  input,
} from "@angular/core";

import {
  createElement,
} from "react";

import {
  createRoot,
} from "react-dom/client";

import type {
  Root,
} from "react-dom/client";

import type {
  VoiceConnectionState,
} from "../../../core/schema/models/realtime";

import {
  VoiceOrb,
} from "../../islands/orb.react";

@Component({
  selector: "app-voice-orb-island",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "block"
  },
  template: `
    <div
      #reactRoot
      class="grid place-items-center"
    ></div>
  `
})
export class VoiceOrbIsland
  implements AfterViewInit {
  readonly state =
    input.required<VoiceConnectionState>();

  readonly inputLevel =
    input(0);

  readonly outputLevel =
    input(0);

  @ViewChild("reactRoot", {
    static: true,
  })
  private readonly reactRootElement!:
    ElementRef<HTMLDivElement>;

  private readonly injector =
    inject(Injector);

  private readonly destroyRef =
    inject(DestroyRef);

  private reactRoot:
    Root | null = null;

  constructor() {
    effect(
      () => {
        const state = this.state();
        const inputLevel = this.inputLevel();
        const outputLevel = this.outputLevel();

        if (!this.reactRoot) {
          return;
        }

        this.renderReactIsland(
          state,
          inputLevel,
          outputLevel,
        );
      },
      {
        injector: this.injector,
      },
    );

    this.destroyRef.onDestroy(() => {
      this.reactRoot?.unmount();
      this.reactRoot = null;
    });
  }

  ngAfterViewInit(): void {
    this.reactRoot =
      createRoot(
        this.reactRootElement.nativeElement,
      );

    this.renderReactIsland(
      this.state(),
      this.inputLevel(),
      this.outputLevel(),
    );
  }

  private renderReactIsland(
    state: VoiceConnectionState,
    inputLevel: number,
    outputLevel: number,
  ): void {
    this.reactRoot?.render(
      createElement(
        VoiceOrb,
        {
          state,
          inputLevel,
          outputLevel,
        },
      ),
    );
  }
}
