export const MAX_CATALOG_IMAGE_URL_LENGTH = 1000;

export function validateCatalogImageUrl(imageUrl, options = {}) {
  const { required = false } = options;

  if (imageUrl === undefined || imageUrl === null) {
    if (required) {
      return {
        isValid: false,
        error: 'imageUrl is required',
      };
    }

    return {
      isValid: true,
      value: undefined,
    };
  }

  if (typeof imageUrl !== 'string') {
    return {
      isValid: false,
      error: 'imageUrl must be a string',
    };
  }

  const normalizedImageUrl = imageUrl.trim();

  if (!normalizedImageUrl) {
    return {
      isValid: false,
      error: 'imageUrl is required',
    };
  }

  if (normalizedImageUrl.length > MAX_CATALOG_IMAGE_URL_LENGTH) {
    return {
      isValid: false,
      error: `imageUrl must be ${MAX_CATALOG_IMAGE_URL_LENGTH} characters or fewer`,
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedImageUrl);
  } catch {
    return {
      isValid: false,
      error: 'imageUrl must be a valid URL',
    };
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return {
      isValid: false,
      error: 'imageUrl must use http or https',
    };
  }

  return {
    isValid: true,
    value: normalizedImageUrl,
  };
}
