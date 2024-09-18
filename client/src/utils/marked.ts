import { Marked } from "marked";

const marked = new Marked();

export const parseMarkdownToHtml = (markdown: string) => {
  return marked.parse(markdown);
};

export default parseMarkdownToHtml;
