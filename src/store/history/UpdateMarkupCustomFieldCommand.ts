import { Command } from './command';

export class UpdateMarkupCustomFieldCommand implements Command {
  readonly description: string;
  readonly markupId: string;
  readonly columnId: string;
  readonly previousValue: string | number | undefined;
  readonly newValue: string | number | undefined;
  private readonly applyValue: (
    markupId: string,
    columnId: string,
    value: string | number | undefined
  ) => void;

  constructor(
    markupId: string,
    columnId: string,
    previousValue: string | number | undefined,
    newValue: string | number | undefined,
    applyValue: (
      markupId: string,
      columnId: string,
      value: string | number | undefined
    ) => void,
    description?: string
  ) {
    this.markupId = markupId;
    this.columnId = columnId;
    this.previousValue = previousValue;
    this.newValue = newValue;
    this.applyValue = applyValue;
    this.description =
      description || `Modificar campo '${columnId}' de marca '${markupId}'`;
  }

  execute(): void {
    this.applyValue(this.markupId, this.columnId, this.newValue);
  }

  undo(): void {
    this.applyValue(this.markupId, this.columnId, this.previousValue);
  }
}
