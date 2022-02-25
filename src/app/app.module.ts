import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { RemoteDesktopModule } from 'remote-desktop';


import { FormsModule } from '@angular/forms';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import {MatDialogModule} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon'; 
import {MatButtonModule} from '@angular/material/button';

import {
  ClipboardModalComponent
} from './components/clipboard-modal.component';
import { OverlayContainer, FullscreenOverlayContainer } from '@angular/cdk/overlay';
import { FileSizePipe } from './pipes/file-size.pipe';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import {MatInputModule} from '@angular/material/input';

@NgModule({
    declarations: [
        AppComponent,
        ClipboardModalComponent,
        FileSizePipe
    ],
    imports: [
        BrowserModule,
        RemoteDesktopModule,
        MatSnackBarModule,
        MatIconModule,
        MatDialogModule,
        FormsModule,
        MatInputModule,
        MatButtonModule,
        BrowserAnimationsModule
    ],
    providers: [{ provide: OverlayContainer, useClass: FullscreenOverlayContainer },
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }
