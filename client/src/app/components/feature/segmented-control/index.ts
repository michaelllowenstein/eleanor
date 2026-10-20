import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";

export interface SegmentedControlOption {
  readonly value: string;
  readonly label: string;
}

@Component({
  selector: "app-segmented-control",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './index.html',
})
export class SegmentedControlComponent {
  readonly options =
    input.required<readonly SegmentedControlOption[]>();

  readonly value =
    input.required<string>();

  readonly valueChange =
    output<string>();

  select(value: string): void {
    if (value !== this.value()) {
      this.valueChange.emit(value);
    }
  }
}