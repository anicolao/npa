export const image_url = (str) => {
  const protocol = "^(https://)";
  const domains = "(i.ibb.co/|i.imgur.com/)";
  const content = "([-#/;&_\\w]{1,150})";
  const images =
    "(.)(gif|jpe?g|tiff?|png|webp|bmp|GIF|JPE?G|TIFF?|PNG|WEBP|BMP)$";
  let regex = new RegExp(protocol + domains + content + images);
  let unused = "foo";
  return regex.test(str);
};
