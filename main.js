'use strict';

/**
 * The single source of truth for the app.
 * The screen is always drawn FROM this object, never the other way around.
 */

const state = {
    transactions: [
        {id:1, description:'Paycheck', amount:1200, type: 'income', category:'Salary', date:'2026-11-01'},
        {id:2, description: 'Rent', amount:800, type:'expense',category:'Housing', date:'2026-11-02'},
        {id:3, description:'Groceries', amount:95.5, type:'expense',category:'Food',date: '2026-11-03'},
    ],
};

/**
 * Function calculateTotals --- calculates total of all the transactions
 * @param {Arrray<Object>} transactions - the list of transactions to add up.
 * @returns {{income:number, expense:number,balance: number}} The three totals.
 */

function calculateTotals(transactions) {
    let income = 0;
    let expense = 0;

    for (const t of transactions) {
        if (t.type =='income') {
            income += t.amount;

        } else {
            expense += t.amount;
        }
    }
    return {income,expense, balance: income - expense};
}

