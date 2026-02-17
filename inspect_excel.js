const ExcelJS = require('exceljs');

async function inspect() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('Дмитриева ведомости.xlsx');
    const sheet = workbook.worksheets[0];

    console.log('--- FOOTER ROW INSPECTION (26-50) ---');
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        if (rowNumber < 26 || rowNumber > 50) return;
        const rowData = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            rowData.push({
                pos: cell.address,
                val: cell.value,
                formula: cell.formula,
                result: cell.result
            });
        });
        console.log(`Row ${rowNumber}:`, JSON.stringify(rowData));
    });
}

inspect().catch(console.error);
