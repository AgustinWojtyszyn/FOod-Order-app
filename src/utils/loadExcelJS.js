let excelJsPromise = null

export const loadExcelJS = async () => {
  if (!excelJsPromise) {
    excelJsPromise = import('exceljs')
      .then((module) => module.default || module)
      .catch((error) => {
        excelJsPromise = null
        throw error
      })
  }

  return excelJsPromise
}

export default loadExcelJS
