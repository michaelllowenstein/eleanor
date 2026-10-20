import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  effect,
  input,
  output,
} from "@angular/core";

@Component({
  selector: "app-passkey-setup-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './index.html'
})
export class PasskeySetupDialog {
  readonly open = input(false);
  readonly supported = input(true);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly enroll = output<void>();

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

  blockClose(event: Event): void {
    if (this.open()) {
      event.preventDefault();
    }
  }
}
