export function orderLabel(order) {
  const id = order?.pId;
  const title = order?.title || "";
  return id ? `#${id} - ${title}` : title;
}
