import { Plugin } from 'unified';
import { Root, Code, Paragraph, Content } from 'mdast';
import { visit } from 'unist-util-visit';

interface HtmlNode {
  type: 'html';
  value: string;
}

export const remarkRestoreHtmlTagsAdvanced: Plugin<[], Root> = () => {
  return (tree: Root) => {
    // 第一轮：处理code块
    visit(tree, 'code', (node: Code, index, parent) => {
      if (shouldConvertToHtml(node.value)) {
        convertCodeToHtml(parent, index, node.value);
      }
    });

    // 第二轮：处理被缩进识别的代码块
    visit(tree, 'pre', (node: any) => {
      if (node.children && node.children[0]?.type === 'code') {
        const codeNode = node.children[0];
        if (shouldConvertToHtml(codeNode.value)) {
          node.children[0] = createHtmlNode(codeNode.value);
        }
      }
    });

    // 第三轮：修复嵌套的code标签
    visit(tree, 'inlineCode', (node: any, index, parent) => {
      if (shouldConvertToHtml(node.value) && isInlineHtml(node.value)) {
        convertInlineCodeToHtml(parent, index, node.value);
      }
    });
  };
};

/**
 * 判断是否应该转换为HTML
 */
function shouldConvertToHtml(value: string): boolean {
  const trimmed = value.trim();

  // 检查是否匹配HTML模式
  const htmlPattern = /^<[a-zA-Z][\s\S]*>|<\/[a-zA-Z][\s\S]*>$/;

  if (!htmlPattern.test(trimmed)) {
    return false;
  }

  // 排除代码示例（包含多行或特殊代码关键字）
  if (trimmed.includes('\n') && (trimmed.includes('function') || trimmed.includes('class') || trimmed.includes('const'))) {
    return false;
  }

  return true;
}

/**
 * 检查是否是内联HTML
 */
function isInlineHtml(value: string): boolean {
  const trimmed = value.trim();
  return /^<[a-zA-Z][^>]*>.*?<\/[a-zA-Z]+>$/.test(trimmed) && !trimmed.includes('\n');
}

/**
 * 创建HTML节点
 */
function createHtmlNode(value: string): HtmlNode {
  return {
    type: 'html',
    value: value.trim(),
  };
}

/**
 * 转换code为HTML
 */
function convertCodeToHtml(parent: any, index: number | undefined, value: string) {
  if (index !== undefined && parent?.children?.[index]) {
    parent.children[index] = createHtmlNode(value);
  }
}

/**
 * 转换内联code为HTML
 */
function convertInlineCodeToHtml(parent: any, index: number | undefined, value: string) {
  if (index !== undefined && parent?.children?.[index]) {
    // 创建文本节点而不是HTML节点（保持内联）
    parent.children[index] = {
      type: 'html',
      value: value.trim(),
    };
  }
}