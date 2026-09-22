import type { ComponentProps } from "react";

/** Horizontally scroll long tables without collapsing column widths (`display:block` on table does). */
export function MarkdownTable(props: ComponentProps<"table">) {
  return (
    <div className="md-table-wrap">
      <table {...props} />
    </div>
  );
}

export const markdownComponents = { table: MarkdownTable };
