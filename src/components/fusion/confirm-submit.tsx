"use client";
export function ConfirmSubmit({label="Delete",message="Remove this record?"}:{label?:string;message?:string}){
 return <button type="submit" className="text-xs text-red-300 hover:underline" onClick={e=>{if(!window.confirm(message))e.preventDefault();}}>{label}</button>;
}
