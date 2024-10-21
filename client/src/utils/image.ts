export const wrapImgWithFancybox = (htmlStr: string, galleryId?: string) => {
  const parser = new DOMParser();
  const dom = parser.parseFromString(htmlStr, "text/html");
  const images = dom.querySelectorAll("img");

  images.forEach((img) => {
    const fancyboxLink = document.createElement("a");
    fancyboxLink.href = img.src;
    fancyboxLink.dataset.fancybox = `gallery${galleryId ? `-${galleryId}` : ""}`;
    fancyboxLink.dataset.caption = img.alt;

    // 将 img 标签移动到 a 标签内
    const parentNode = img.parentNode;
    if (parentNode && !(parentNode as HTMLElement).dataset.fancybox) {
      parentNode.insertBefore(fancyboxLink, img);
      fancyboxLink.appendChild(img);
    }
  });

  const serializer = new XMLSerializer();
  const resultHtmlStr = serializer.serializeToString(dom);
  return resultHtmlStr;
};
