'use strict';

/**
 * The single source of truth for the app.
 * The screen is always drawn FROM this object, never the other way around.
 */

const state = {
    transactions: [
        {id:1, description:'Paycheck', amount:1200, type: 'income', category:'Salary', date:'2026-11-01'},
        {id:2, description: 'Rent', amount:500, type:'expense',category:'Housing', date:'2026-11-02'},
        {id:3, description:'Groceries', amount:95.5, type:'expense',category:'Food',date: '2026-11-03'},
        {id:4, description: 'Freelance gig', amount: 1200, type: 'income', category:'Freelance' , date: '2026-11-04' },
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


const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

/**
 * Formats a number as US dollars.
 * 
 * @param {number} value- An amount in dollars
 * @returns {string} The formatted text, for example $1400.00".
 */

function formatCurrency(value){
    return currencyFormatter.format(value);
}

/**
 * function render()
 * writes the current totals into the metric cards in the page
 * call this every time the data changes
 * @returns void
 */

function render()
{
   const finalObject = calculateTotals(state.transactions);

    document.getElementById("balance-amount").textContent= formatCurrency(finalObject.balance);

    document.getElementById("income-amount").textContent= formatCurrency(finalObject.income);

    document.getElementById("expense-amount").textContent=formatCurrency(finalObject.expense);

    lucide.createIcons();
}

render();