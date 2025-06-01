.globl entrypoint
entrypoint:
    ldxdw r2, [r1 + 0]            // get number of accounts
    jne r2, 2, insufficient_accounts // error if not 2 accounts
    ldxb r2, [r1 + 8]             // get first account writable flag
    
    // Load sender pubkey start address
    mov64 r9, r1
    add64 r9, 8 + 8               // r9 = sender pubkey start (skip writable flag + 8-byte reserved field)
    
    ldxdw r2, [r1 + 8 + 8 + 32 + 32]       // get sender lamports (offset: 80)
    ldxdw r3, [r1 + 8 + 8 + 32 + 32 + 8]   // get sender account data size (offset: 88)
    
    mov64 r4, r1
    add64 r4, 8 + 8 + 32 + 32 + 8 + 8 + 10240 + 8 // calculate end of sender account data
    add64 r4, r3
    mov64 r5, r4                  // check how much padding we need to add
    and64 r4, -8                  // clear low bits (align to 8)
    jeq r5, r4, no_padding_sender
    add64 r4, 8                  // add 8 for truncation if needed
no_padding_sender:

    // Load receiver pubkey start address  
    mov64 r7, r4
    add64 r7, 8                  // r7 = receiver pubkey start (skip writable flag + 8-byte reserved field)
    
    // Compare first few bytes of pubkeys to detect same account
    ldxdw r0, [r9 + 0]           // first 8 bytes of sender pubkey
    ldxdw r6, [r7 + 0]           // first 8 bytes of receiver pubkey
    jeq r0, r6, check_more_pubkey
    jne r0, r6, different_accounts

check_more_pubkey:
    ldxdw r0, [r9 + 8]           // next 8 bytes of sender pubkey  
    ldxdw r6, [r7 + 8]           // next 8 bytes of receiver pubkey
    jeq r0, r6, same_account_error

different_accounts:
    ldxb r5, [r4 + 0]            // get second account writable flag
    jne r5, 0xff, error          // we don't allow non-writable accounts
    
    ldxdw r5, [r4 + 8 + 32 + 32]         // get receiver lamports (offset: r4 + 72)
    ldxdw r6, [r4 + 8 + 32 + 32 + 8]     // get receiver account data size (offset: r4 + 80)
    
    mov64 r8, r4
    add64 r8, 8 + 32 + 32 + 8 + 8 + 10240 + 8 // calculate end of receiver account data
    add64 r8, r6
    
    mov64 r3, r8                  // check how much padding we need to add
    and64 r8, -8                  // clear low bits (align to 8)
    jeq r3, r8, no_padding_recv
    add64 r8, 8                  // add 8 for truncation if needed
no_padding_recv:
    
    ldxdw r3, [r8 + 0]           // get instruction data size
    jne r3, 8, invalid_instruction_data // need 8 bytes of instruction data
    
    ldxdw r3, [r8 + 8]           // get instruction data as little-endian u64 (transfer amount)
    
    // Check if amount is zero
    jeq r3, 0, zero_amount
    
    // Check sufficient funds
    mov64 r0, r2                  // copy sender balance
    sub64 r0, r3                  // subtract transfer amount
    jgt r0, r2, insufficient_funds // if result > original, underflow occurred
    
    // Check receiver overflow  
    mov64 r6, r5                  // copy receiver balance
    add64 r6, r3                  // add transfer amount
    jlt r6, r5, overflow_error   // if result < original, overflow occurred
    
    // Update balances
    sub64 r2, r3                  // subtract lamports from sender
    add64 r5, r3                  // add lamports to receiver
    
    stxdw [r1 + 8 + 8 + 32 + 32], r2    // write sender balance back
    stxdw [r4 + 8 + 32 + 32], r5        // write receiver balance back
    
    // Log success with transfer amount
    mov64 r1, r3
    mov64 r2, 0
    mov64 r3, 0
    mov64 r4, 0
    mov64 r5, 0
    call sol_log_64_
    exit

insufficient_accounts:
    lddw r0, 1
    lddw r1, accounts_error
    lddw r2, 35
    call sol_log_
    exit

same_account_error:
    lddw r0, 1
    lddw r1, same_account_msg
    lddw r2, 42
    call sol_log_
    exit

zero_amount:
    lddw r0, 1
    lddw r1, zero_error
    lddw r2, 28
    call sol_log_
    exit

insufficient_funds:
    lddw r0, 1
    lddw r1, funds_error
    lddw r2, 19
    call sol_log_
    exit

overflow_error:
    lddw r0, 1
    lddw r1, overflow_msg
    lddw r2, 25
    call sol_log_
    exit

invalid_instruction_data:
    lddw r0, 1
    lddw r1, instruction_error
    lddw r2, 32
    call sol_log_
    exit
    
error:
    mov64 r0, 1
    exit

.extern sol_log_ sol_log_64_

.rodata
accounts_error: .ascii "Need at least 2 accounts for transfer"
same_account_msg: .ascii "Cannot transfer to the same account address"
zero_error: .ascii "Transfer amount cannot be zero"
funds_error: .ascii "Insufficient balance"
overflow_msg: .ascii "Transfer would cause overflow"
instruction_error: .ascii "Invalid instruction data provided"