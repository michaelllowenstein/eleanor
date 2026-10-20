import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  effect,
  input,
  output,
  signal,
} from "@angular/core";

import type {
  AiProvider,
} from "../../../../core/services/provider";

@Component({
  selector: "app-provider-credential-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './index.html'
})
export class ProviderCredentialDialog {
  readonly open = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly save = output<{
    readonly provider: AiProvider;
    readonly apiKey: string;
  }>();

  readonly provider =
    signal<AiProvider>("openai");

  readonly apiKey = signal("");

  @ViewChild("dialog", { static: true })
  private readonly dialog!:
    ElementRef<HTMLDialogElement>;

  constructor() {
    effect(() => {
      const element = this.dialog?.nativeElement;

      if (!element) {
        return;
      }

      if (this.open() && !element.open) {
        element.showModal();
      } else if (!this.open() && element.open) {
        element.close();
      }
    });
  }

  submit(event: Event): void {
    event.preventDefault();

    const apiKey = this.apiKey().trim();

    if (apiKey.length >= 20) {
      this.save.emit({
        provider: this.provider(),
        apiKey,
      });
    }
  }

  clear(): void {
    this.apiKey.set("");
  }

  blockClose(event: Event): void {
    if (this.open()) {
      event.preventDefault();
    }
  }

  readProvider(event: Event): AiProvider {
    return (
      event.target as HTMLSelectElement
    ).value as AiProvider;
  }

  readInput(event: Event): string {
    return (
      event.target as HTMLInputElement
    ).value;
  }
}
