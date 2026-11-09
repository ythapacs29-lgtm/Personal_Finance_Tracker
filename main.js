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

const form = document.getElementById('transaction-form');
/**
 * Runs when the user submits the transaction form.
 * 
 * @param{SubmitEvent} event- Information about the submit.
 * @returns {void}
 */

/***
 * checks the raw form input and converts it into clean values.
 * 
 * 
 * @param{object} raw - the values  exactly as typed ( all strings).
 * @returns {{isValid: boolean, error:Object, values: Object}}
 * isValid: true if everything is ok.
 * errors: field name -> error message, for each problem found.
 * values: the cleaned-up values, with amount converted to a number.
 */

function validateTransaction(raw){
    const error = {};
    
    const description = raw.description.trim;

    const amount =Number(raw.amount);

    if (raw.Description ==='') {
        error.description = 'Please enter a description.';

    }

    if (raw.amount === ''){
        error.amount = 'please enter an amount';

    } else if (!Number.isFinite(amount) || amount <= 0) {
        error.amount = 'Amount must be a number greater than 0.';
    }

    if (raw.category === ''){
        error.category = 'Please choose a category.';
    }

    if (raw.date ===''){
        error.date ='Please pick a date.';
    }

    const isValid = Object.keys(errors).length === 0;

    return {
        isValid,
        errors,
        values: {
            description,
            amount,
            type: raw.type,
            category: raw.category,
            date: raw.date,
        
        },
      
    };
}
function handleFormSubmit(event){
    event.preventDefault();

    const formData = new FormData(form);
    const raw = {
        type: formData.get('type'),
        description: formData.get('description'),
        amount: formData.get('amount'),
        category: formData.get('category'),
        date: formData.get('date'),

    };
    console.log(raw);
    console.log('amount is a', typeof raw.amount)
    console.log('Form submitted!');
}


form.addEventListener('submit',handleFormSubmit);


render();
