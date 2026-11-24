export function parseWordList(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const split = line.split(/\s*(?:\||\t)\s*/, 2)
    return { front: split[0].trim(), back: split[1]?.trim() ?? '' }
  }).filter((card) => card.front)
}

function parseCsvRow(line: string) {
  const cells: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (quoted && character === '"' && line[index + 1] === '"') {
      cell += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += character
    }
  }

  if (quoted) throw new Error('CSV file contains an unclosed quote.')
  cells.push(cell.trim())
  return cells
}

export function parseCardFile(text: string, fileName: string) {
  if (!fileName.toLowerCase().endsWith('.csv')) return parseWordList(text)

  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const parsedRows = rows.map(parseCsvRow)
  const firstRow = parsedRows[0]?.map((cell) => cell.toLowerCase()) ?? []
  if (['front', 'term', 'question'].includes(firstRow[0]) && ['back', 'definition', 'answer'].includes(firstRow[1])) {
    parsedRows.shift()
  }

  return parsedRows
    .map(([front = '', back = '']) => ({ front, back }))
    .filter((card) => card.front)
}
