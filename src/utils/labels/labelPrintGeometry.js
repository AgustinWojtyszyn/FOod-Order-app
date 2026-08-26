export const LABEL_PRINT_GEOMETRY = Object.freeze({
  widthMm: 64,
  heightMm: 32,
  safePaddingXmm: 2.2,
  safePaddingYmm: 1.7
})

export const LABEL_WIDTH_MM = LABEL_PRINT_GEOMETRY.widthMm
export const LABEL_HEIGHT_MM = LABEL_PRINT_GEOMETRY.heightMm
export const LABEL_SAFE_PADDING_X_MM = LABEL_PRINT_GEOMETRY.safePaddingXmm
export const LABEL_SAFE_PADDING_Y_MM = LABEL_PRINT_GEOMETRY.safePaddingYmm

export const LABEL_WIDTH_CSS = `${LABEL_WIDTH_MM}mm`
export const LABEL_HEIGHT_CSS = `${LABEL_HEIGHT_MM}mm`
export const LABEL_SAFE_PADDING_X_CSS = `${LABEL_SAFE_PADDING_X_MM}mm`
export const LABEL_SAFE_PADDING_Y_CSS = `${LABEL_SAFE_PADDING_Y_MM}mm`
export const LABEL_PHYSICAL_SIZE_CSS = `${LABEL_WIDTH_CSS} ${LABEL_HEIGHT_CSS}`
export const LABEL_PAGE_SIZE_CSS = LABEL_PHYSICAL_SIZE_CSS
export const LABEL_DIMENSIONS_TEXT = `${LABEL_WIDTH_MM} x ${LABEL_HEIGHT_MM} mm`
