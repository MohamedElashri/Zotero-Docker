/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2016 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

Zotero.HardConfirmationDialog = {
	init: function() {
		this.io = window.arguments[0];
		
		Zotero.setFontSize(document.getElementById('zotero-hardConfirmationDialog'));
		
		var vbox = document.getElementById('infoContainer');
		var sep = vbox.firstChild;
		
		document.getElementById('infoBody').textContent = this.io.text;
		
		if (this.io.title) {
			document.documentElement.setAttribute('title', this.io.title);
			
			if (Zotero.isMac) {
				let elem = document.getElementById('infoTitle');
				elem.textContent = this.io.title;
				elem.style.marginBottom = '12px';
				elem.hidden = false;
			}
		}
		if (this.io.checkboxLabel) {
			var checkbox = document.getElementById('zotero-hardConfirmationDialog-checkbox');
			checkbox.hidden = false;
			checkbox.setAttribute('label', this.io.checkboxLabel);
			this.onCheckbox();
		}
		if (this.io.confirmationText) {
			document.getElementById('zotero-hardConfirmationDialog-textbox').hidden = false;
			this.onKeyUp();
		}
		
		if (this.io.acceptLabel) {
			document.documentElement.getButton('accept').label = this.io.acceptLabel
		}
		if (this.io.extra1Label) {
			document.documentElement.buttons = document.documentElement.buttons + ',extra1';
			document.documentElement.getButton('extra1').label = this.io.extra1Label
		}
		if (this.io.extra2Label) {
			document.documentElement.buttons = document.documentElement.buttons + ',extra2';
			document.documentElement.getButton('extra2').label = this.io.extra2Label
		}
	},
	
	onCheckbox: function(event) {
		document.documentElement.getButton('accept').disabled = 
			!document.getElementById('zotero-hardConfirmationDialog-checkbox').checked;
	},
	
	onKeyUp: function(event) {
		document.documentElement.getButton('accept').disabled = 
			document.getElementById('zotero-hardConfirmationDialog-textbox').value != this.io.confirmationText;
	},
	
	onAccept: function() {
		this.io.accept = true;
	},
	
	onExtra1: function() {
		this.io.extra1 = true;
		document.documentElement.cancelDialog();
	},
	
	onExtra2: function() {
		this.io.extra2 = true;
		document.documentElement.cancelDialog();
	}
};
