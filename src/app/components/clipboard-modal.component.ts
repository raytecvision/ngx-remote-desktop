import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA} from '@angular/material/dialog';
import { RemoteDesktopService } from 'remote-desktop';

export interface DialogData {
    manager: RemoteDesktopService;
    text: string;
}

@Component({
    selector: 'app-clipboard-modal',
    template: `
        <h1 class="modal-title">Clipboard</h1>
        <div class="modal-body">
            <p>
                Text copied/cut within the remote desktop will appear here. 
                Sending the text below will affect the remote desktop clipboard.
            </p>
            <mat-form-field style="width: 100%;">
                <textarea style="height: 150px;" matInput type="text" [(ngModel)]="text"></textarea>
            </mat-form-field>

        </div>
        <div class="modal-footer">
            <button  mat-button type="button"
                    (click)="submit()" 
                    [disabled]="text.length === 0">
                Send to remote desktop clipboard
            </button>
            <button mat-button color="accent" (click)="close()">Close</button>
        </div>
    `
})
export class ClipboardModalComponent implements OnInit {
    constructor(
        public dialogRef: MatDialogRef<ClipboardModalComponent>,
        @Inject(MAT_DIALOG_DATA) public data: DialogData) {}


    text = '';
    private clipboardData = [];
    private clipboardSubscription;

    ngOnInit() {
        this.clipboardSubscription = this.data.manager.onRemoteClipboardData;
        this.clipboardSubscription.subscribe(data => this.text = data);
    }

    public close() {
        this.dialogRef.close();
    }

    submit() {
        this.data.manager.sendRemoteClipboardData(this.text);
        this.dialogRef.close();
    }

}
