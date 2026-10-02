const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({
    window: { selectedYear: 2026 },
    document: { addEventListener() {}, getElementById() { return null; } },
    console,
});
vm.runInContext(fs.readFileSync('static/PMS_annualMoney_v2.js', 'utf8'), context);
const project = (id, extra = {}) => ({
    projectID: id, ContractCode: `26-test-${id}`, ProjectName: `Project ${id}`,
    project_status: '진행중', EndDate: '2026-12-31', total_progress: 42.5,
    realCostShare_VAT: 11000, realCostShare: 10000,
    completionBeforeTotal: 1100, completionTotal: 2200,
    outsourcing_balance: 3000, ...extra,
});
const rows = [
    project(1),
    project(2, { EndDate: '2027-01-01', receipt_details: [{ receipt_date: '2026-01-01' }] }),
    project(3, { EndDate: '2028-12-31', outsourcing_payment_details: [{ payment_date: '2026-12-31' }] }),
    project(4, { EndDate: '2027-01-01', receipt_details: [{ receipt_date: '2025-12-31' }] }),
    project(5, { EndDate: '2027-01-01', project_status: '용역중지', receipt_details: [{ receipt_date: '2026-01-01' }] }),
    project(6, { ContractCode: '26-test-00', EndDate: '2027-01-01', receipt_details: [{ receipt_date: '2026-01-01' }] }),
    project(7, { EndDate: '2025-12-31', receipt_details: [{ receipt_date: '2026-01-01' }] }),
];
const sections = context.splitAnnualMoneySections(rows);
for (const [key, expected] of Object.entries({ currentEvent: [1, 2, 3, 5, 7], nextYear: [2, 5, 4], longTerm: [4], stop: [], total: [6] })) {
    assert.deepEqual(Array.from(sections[key], p => p.projectID), expected);
}
assert.equal(context.isAnnualMoneyCurrentEventProject(rows[1], 2026), true);
const stoppedRows = [
    project(10, { project_status: '용역중지', outsourcing_payment_details: [{ payment_date: '2026-09-29', amount: 100 }] }),
    project(11, { project_status: '용역중지', receipt_details: [{ receipt_date: '2025-12-31', amount: 100 }] }),
    project(12, { project_status: '용역중지', receipt_details: [{ receipt_date: '2026-01-01', amount: 100 }], outsourcing_payment_details: [{ payment_date: '2026-09-29', amount: 100 }] }),
    project(13, { project_status: '용역중지', has_risk: true }),
];
const stoppedSections = context.splitAnnualMoneySections(stoppedRows);
assert.deepEqual(Array.from(stoppedSections.currentEvent, p => p.projectID), [10, 12]);
assert.deepEqual(Array.from(stoppedSections.stop, p => p.projectID), [11, 13]);
assert.equal(context.getAnnualMoneyStatsProjects(stoppedSections).length, stoppedRows.length);
for (const p of [rows[4], ...stoppedRows]) {
    assert.match(context.buildAnnualMoneyProjectRow(p, 0), /class="stop-row"/);
}
assert.equal(context.getAnnualMoneyStatsProjects(sections).length, 6);
assert.equal(context.buildAnnualMoneyStatsBuckets(sections).next.receiptBalance, 23100);
assert.equal(context.buildAnnualMoneyStatsBuckets(sections).next.outsourcingBalance, 9900);
assert.equal(context.buildAnnualMoneyStatsBuckets(sections).current.receiptBalance, 23100);
assert.equal(context.buildAnnualMoneyStatsBuckets(sections).long.receiptBalance, 0);
assert.deepEqual(Array.from(context.getAnnualMoneyNextGroups(sections)[0].list, p => p.projectID), [2, 5]);
assert.deepEqual(Array.from(context.getAnnualMoneyNextGroups(sections)[1].list, p => p.projectID), [4]);
const buckets = context.buildAnnualMoneyStatsBuckets(sections);
assert.equal(Object.values(buckets).reduce((sum, b) => sum + b.receiptBalance, 0), context.aggregateAnnualMoneyDisplaySummary(context.getAnnualMoneyStatsProjects(sections)).receiptBalance);
assert.equal(context.buildAnnualMoneyExportStatsPayload(context.getAnnualMoneyStatsProjects(sections), sections).receipt.receivedBeforeTotal, 6600);
assert.equal(context.aggregateAnnualMoneyDisplaySummary(rows).completionBeforeTotal, 7700);
assert.equal(context.buildAnnualMoneyExportRow(rows[0], 0).totalProgress, 42.5);
assert.equal(context.buildAnnualMoneyExportRow(rows[0], 0).completionBeforeTotal, 1100);
assert.equal((context.buildAnnualMoneyProjectRow(rows[0], 0).match(/<td\b/g) || []).length, 22);
assert.equal((context.buildAnnualMoneyTableColgroup().match(/<col /g) || []).length, 22);
assert.equal((context.buildAnnualMoneyTableHead().match(/사업비<br>/g) || []).length, 4);
const quarterProject = project(8, { quarterCompletion: { 1: 3300, 2: 1100 } });
assert.equal(context.getAnnualMoneyVatView(quarterProject, 2).completionBeforeTotal, 1100);
assert.equal(context.getAnnualMoneyVatView(quarterProject, 2).receiptBalance, 5500);
vm.runInContext("vatMode = 'exclude'", context);
assert.equal(context.getAnnualMoneyVatView(rows[0]).completionBeforeTotal, 1000);
assert.equal(context.getAnnualMoneyVatView(rows[0]).receiptBalance, 7000);
assert.equal(context.buildAnnualMoneyStatsBuckets(sections).next.receiptBalance, 21000);
assert.equal(context.buildAnnualMoneyStatsBuckets(sections).next.outsourcingBalance, 9000);
const host = { innerHTML: '' };
context.document.getElementById = () => host;
context.renderAnnualMoneySectionTable('next', sections.nextYear, { groups: context.getAnnualMoneyNextGroups(sections) });
assert.equal((host.innerHTML.match(/<thead>/g) || []).length, 1);
assert.equal((host.innerHTML.match(/>소계</g) || []).length, 2);
assert.ok(host.innerHTML.indexOf('차기년도(당해년도)') < host.innerHTML.indexOf('차기년도(장기사업)'));
assert.match(host.innerHTML, /stop-row/);
const emptySections = context.splitAnnualMoneySections([]);
context.renderAnnualMoneySectionTable('next', [], { groups: context.getAnnualMoneyNextGroups(emptySections) });
assert.equal((host.innerHTML.match(/>소계</g) || []).length, 2);
console.log('Annual money classification, balances, VAT, completion receipts and table columns passed.');
