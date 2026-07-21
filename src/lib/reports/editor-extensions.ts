import Document from "@tiptap/extension-document";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import StarterKit from "@tiptap/starter-kit";

export const VersionedDocument = Document.extend({
  addAttributes() {
    return { version: { default: 1, rendered: false } };
  },
});

export function reportEditorExtensions() {
  return [
    VersionedDocument,
    StarterKit.configure({
      document: false,
      heading: { levels: [1, 2, 3] },
      link: false,
      strike: false,
      horizontalRule: false,
      dropcursor: false,
      gapcursor: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      protocols: ["http", "https"],
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
  ];
}
