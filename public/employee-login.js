export function employeeLogin25(value){
 const normalized=String(value).trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
 if(/^\d{5,8}$/.test(normalized))return 'rn.'+normalized+'@icukaash.local';
 if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))return normalized;
 throw Error('Enter a valid employee number or email.');
}
